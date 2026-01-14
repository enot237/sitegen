FROM node:20-alpine

WORKDIR /app

COPY package.json ./
RUN npm install

COPY src ./src

EXPOSE 3001

CMD ["sh", "-c", "npm install && npm run dev"]
