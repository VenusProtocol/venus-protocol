import { ComptrollerErr, TokenErr, VAIControllerErr } from "./ErrorReporterConstants";

export interface ErrorReporter {
  getError(error: any): string | null;
  getInfo(info: any): string | null;
  getDetail(error: any, detail: number): string;
}

class NoErrorReporterType implements ErrorReporter {
  getError(): string | null {
    return null;
  }

  getInfo(): string | null {
    return null;
  }

  getDetail(error: any, detail: number): string {
    return detail.toString();
  }
}

class VTokenErrorReporterType implements ErrorReporter {
  getError(error: any): string | null {
    if (error === null) {
      return null;
    } else {
      return TokenErr.ErrorInv[Number(error)];
    }
  }

  getInfo(info: any): string | null {
    if (info === null) {
      return null;
    } else {
      return TokenErr.FailureInfoInv[Number(info)];
    }
  }

  getDetail(error: any, detail: number): string {
    // Little hack to let us use proper names for cross-contract errors
    if (this.getError(error) === "COMPTROLLER_REJECTION") {
      const comptrollerError = ComptrollerErrorReporter.getError(detail);

      if (comptrollerError) {
        return comptrollerError;
      }
    }

    return detail.toString();
  }
}

class ComptrollerErrorReporterType implements ErrorReporter {
  getError(error: any): string | null {
    if (error === null) {
      return null;
    } else {
      // TODO: This probably isn't right...
      return ComptrollerErr.ErrorInv[Number(error)];
    }
  }

  getInfo(info: any): string | null {
    if (info === null) {
      return null;
    } else {
      // TODO: This probably isn't right...
      return ComptrollerErr.FailureInfoInv[Number(info)];
    }
  }

  getDetail(error: any, detail: number): string {
    if (this.getError(error) === "REJECTION") {
      const comptrollerError = ComptrollerErrorReporter.getError(detail);

      if (comptrollerError) {
        return comptrollerError;
      }
    }

    return detail.toString();
  }
}
class VAIControllerErrorReporterType implements ErrorReporter {
  getError(error: any): string | null {
    if (error === null) {
      return null;
    } else {
      // TODO: This probably isn't right...
      return VAIControllerErr.ErrorInv[Number(error)];
    }
  }

  getInfo(info: any): string | null {
    if (info === null) {
      return null;
    } else {
      // TODO: This probably isn't right...
      return VAIControllerErr.FailureInfoInv[Number(info)];
    }
  }

  getDetail(error: any, detail: number): string {
    if (this.getError(error) === "REJECTION") {
      const vaicontrollerError = VAIControllerErrorReporter.getError(detail);

      if (vaicontrollerError) {
        return vaicontrollerError;
      }
    }

    return detail.toString();
  }
}

export function formatResult(errorReporter: ErrorReporter, result: any): string {
  const errorStr = errorReporter.getError(result);
  if (errorStr !== null) {
    return `Error=${errorStr}`;
  } else {
    return `Result=${result}`;
  }
}

// Singleton instances
export const NoErrorReporter = new NoErrorReporterType();
export const VTokenErrorReporter = new VTokenErrorReporterType();
export const ComptrollerErrorReporter = new ComptrollerErrorReporterType();
export const VAIControllerErrorReporter = new VAIControllerErrorReporterType();
