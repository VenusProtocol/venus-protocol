FROM node:12

RUN apt-get update && apt-get install -y build-essential python3 git g++ make
RUN wget https://github.com/ethereum/solidity/releases/download/v0.5.16/solc-static-linux -O /bin/solc && chmod +x /bin/solc

RUN mkdir -p /venus-protocol
RUN mkdir -p /venus-protocol/scenario
WORKDIR /venus-protocol

# First add deps
ADD ./package.json /venus-protocol
ADD ./yarn.lock /venus-protocol
ADD ./scenario/package.json /venus-protocol/scenario
RUN yarn install --lock-file
RUN cd scenario && yarn install & cd ..

# Then rest of code and build
ADD . /venus-protocol

ENV SADDLE_SHELL=/bin/sh
ENV SADDLE_CONTRACTS="contracts/*.sol contracts/**/*.sol"
RUN npx saddle compile

RUN yarn cache clean

ENTRYPOINT ["yarn"]
