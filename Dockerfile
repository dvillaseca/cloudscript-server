FROM node:20-alpine

RUN apk update && \
    apk add --no-cache nano bash python3 make g++
RUN npm install -g npm
WORKDIR /app
COPY . /app
RUN npm install

CMD [ "node" , "./ws-server.js" ]