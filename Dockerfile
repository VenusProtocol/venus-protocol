FROM node:16

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

RUN npx hardhat compile

RUN yarn cache clean

ENTRYPOINT ["yarn"]
