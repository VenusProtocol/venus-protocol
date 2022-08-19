FROM node:14

RUN apt-get update && apt-get install -y build-essential python3 git g++ make
RUN wget https://github.com/ethereum/solidity/releases/download/v0.5.16/solc-static-linux -O /bin/solc && chmod +x /bin/solc

RUN mkdir -p /venus-protocol
WORKDIR /venus-protocol

# First add deps
ADD ./package.json /venus-protocol
ADD ./yarn.lock /venus-protocol
RUN yarn install --lock-file

# Then rest of code and build
ADD . /venus-protocol

ENV SADDLE_SHELL=/bin/sh
ENV SADDLE_CONTRACTS="contracts/*.sol contracts/**/*.sol"
RUN npx saddle compile

RUN yarn cache clean

ENTRYPOINT ["yarn"]
