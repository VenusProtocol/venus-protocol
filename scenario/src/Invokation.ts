import { TransactionReceipt } from "web3-eth";

import { encodedNumber } from "./Encoding";
import { ErrorReporter, NoErrorReporter } from "./ErrorReporter";
import { mustArray } from "./Utils";
import { World } from "./World";

const errorRegex = /^(.*) \((\d+)\)$/;

function getErrorCode(revertMessage: string): [string, number] | null {
  const res = errorRegex.exec(revertMessage);

  if (res) {
    return [res[1], Number(res[2])];
  } else {
    return null;
  }
}

export interface InvokationOpts {
  from?: string;
  gas?: number;
  gasPrice?: number;
}

export class InvokationError extends Error {
  err: Error;
  // function : string
  // arguments : {[]}

  constructor(err: Error) {
    super(err.message);
    this.err = err;
  }

  toString() {
    return `InvokationError<err=${this.err.toString()}>`;
  }
}

export class InvokationRevertFailure extends InvokationError {
  errCode: number;
  error: string | null;
  errMessage: string;

  constructor(err: Error, errMessage: string, errCode: number, error: string | null) {
    super(err);

    this.errMessage = errMessage;
    this.errCode = errCode;
    this.error = error;
  }

  toString() {
    return `InvokationRevertError<errMessage=${this.errMessage},errCode=${this.errCode},error=${this.error}>`;
  }
}

interface Argument {
  name: string;
  type: string;
}

interface Method {
  name: string;
  inputs: Argument[];
}

export interface Callable<T> {
  estimateGas: (InvokationOpts?) => Promise<number>;
  call: (InvokationOpts?) => Promise<T>;
  _method: Method;
  arguments: any[];
}

export interface Sendable<T> extends Callable<T> {
  send: (InvokationOpts) => Promise<TransactionReceipt>;
}

export class Failure {
  error: string;
  info: string;
  detail: string;

  constructor(error: string, info: string, detail: string) {
    this.error = error;
    this.info = info;
    this.detail = detail;
  }

  toString(): string {
    return `Failure<error=${this.error},info=${this.info},detail=${this.detail}>`;
  }

  equals(other: Failure): boolean {
    return this.error === other.error && this.info === other.info && this.detail === other.detail;
  }
}

export class Invokation<T> {
  value: T | null;
  receipt: TransactionReceipt | null;
  error: Error | null;
  failures: Failure[];
  method: string | null;
  args: { arg: string; val: any }[];
  errorReporter: ErrorReporter;

  constructor(
    value: T | null,
    receipt: TransactionReceipt | null,
    error: Error | null,
    fn: Callable<T> | null,
    errorReporter: ErrorReporter = NoErrorReporter,
  ) {
    this.value = value;
    this.receipt = receipt;
    this.error = error;
    this.errorReporter = errorReporter;

    if (fn !== null) {
      this.method = fn._method.name;
      this.args = fn.arguments.map((argument, i) => ({ arg: fn._method.inputs[i].name, val: argument }));
    } else {
      this.method = null;
      this.args = [];
    }

    if (receipt !== null && receipt.events && receipt.events["Failure"]) {
      const failures = mustArray(receipt.events["Failure"]);

      this.failures = failures.map(failure => {
        const { error: errorVal, info: infoVal, detail: detailVal } = failure.returnValues;

        return new Failure(
          errorReporter.getError(errorVal) || `unknown error=${errorVal}`,
          errorReporter.getInfo(infoVal) || `unknown info=${infoVal}`,
          errorReporter.getDetail(errorVal, detailVal),
        );
      });
    } else {
      this.failures = [];
    }
  }

  success(): boolean {
    return this.error === null && this.failures.length === 0;
  }

  invokation(): string {
    if (this.method) {
      const argStr = this.args.map(({ arg, val }) => `${arg}=${val.toString()}`).join(",");
      return `"${this.method}(${argStr})"`;
    } else {
      return `unknown method`;
    }
  }

  toString(): string {
    return `Invokation<${this.invokation()}, tx=${this.receipt ? this.receipt.transactionHash : ""}, value=${
      this.value ? (<any>this.value).toString() : ""
    }, error=${this.error}, failures=${this.failures.toString()}>`;
  }
}

export async function fallback(
  world: World,
  from: string,
  to: string,
  value: encodedNumber,
): Promise<Invokation<string>> {
  const trxObj = {
    from: from,
    to: to,
    value: value.toString(),
  };

  const estimateGas = async (opts: InvokationOpts) => {
    const trxObjMerged = {
      ...trxObj,
      ...opts,
    };

    return <number>await world.web3.eth.estimateGas(trxObjMerged);
  };

  const call = async (opts: InvokationOpts) => {
    const trxObjMerged = {
      ...trxObj,
      ...opts,
    };

    return <string>await world.web3.eth.call(trxObjMerged);
  };

  const send = async (opts: InvokationOpts) => {
    const trxObjMerged = {
      ...trxObj,
      ...opts,
    };

    const receipt = await world.web3.eth.sendTransaction(trxObjMerged);
    receipt.events = {};

    return receipt;
  };

  const fn: Sendable<string> = {
    estimateGas: estimateGas,
    call: call,
    send: send,
    _method: {
      name: "fallback",
      inputs: [],
    },
    arguments: [],
  };

  return invoke<string>(world, fn, from, NoErrorReporter);
}

export async function invoke<T>(
  world: World,
  fn: Sendable<T>,
  from: string,
  errorReporter: ErrorReporter = NoErrorReporter,
): Promise<Invokation<T>> {
  let value: T | null = null;
  let result: TransactionReceipt | null = null;
  const worldInvokationOpts = world.getInvokationOpts({ from: from });
  const trxInvokationOpts = world.trxInvokationOpts.toJS();

  let invokationOpts = {
    ...worldInvokationOpts,
    ...trxInvokationOpts,
  };

  if (world.totalGas) {
    invokationOpts = {
      ...invokationOpts,
      gas: world.totalGas,
    };
  } else {
    try {
      const gas = await fn.estimateGas({ ...invokationOpts });
      invokationOpts = {
        ...invokationOpts,
        gas: gas * 2,
      };
    } catch (e) {
      invokationOpts = {
        ...invokationOpts,
        gas: 2000000,
      };
    }
  }

  try {
    try {
      value = await fn.call({ ...invokationOpts });
    } catch (err) {
      new InvokationError(err as Error);
    }

    if (world.dryRun) {
      world.printer.printLine(`Dry run: invoking \`${fn._method.name}\``);
      // XXXS
      result = <TransactionReceipt>(<unknown>{
        blockNumber: -1,
        transactionHash: "0x",
        gasUsed: 0,
        events: {},
      });
    } else {
      result = await fn.send({ ...invokationOpts });
      world.gasCounter.value += result.gasUsed;
    }

    if (world.settings.printTxLogs) {
      const eventLogs = Object.values((result && result.events) || {}).map((event: any) => {
        const eventLog = event.raw;
        if (eventLog) {
          const eventDecoder = world.eventDecoder[eventLog.topics[0]];
          if (eventDecoder) {
            return eventDecoder(eventLog);
          } else {
            return eventLog;
          }
        }
      });
      console.log("EMITTED EVENTS:   ", eventLogs);
    }

    return new Invokation<T>(value, result, null, fn, errorReporter);
  } catch (err) {
    if (errorReporter) {
      const decoded = getErrorCode(err.message);

      if (decoded) {
        const [errMessage, errCode] = decoded;

        return new Invokation<T>(
          value,
          result,
          new InvokationRevertFailure(err, errMessage, errCode, errorReporter.getError(errCode)),
          fn,
          errorReporter,
        );
      }
    }

    return new Invokation<T>(value, result, new InvokationError(err), fn, errorReporter);
  }
}
