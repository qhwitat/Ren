FROM node:20-slim

WORKDIR /app

COPY package.json .
RUN npm install

COPY client/package.json client/
RUN cd client && npm install

COPY client/ client/
RUN cd client && npm run build

COPY server.js .

ENV PORT=7860
ENV HOST=0.0.0.0

EXPOSE 7860

CMD ["node", "server.js"]
