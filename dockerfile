
FROM node:22.21.1

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

EXPOSE 3333

RUN npx prisma generate

CMD [ "npm", "start" ]