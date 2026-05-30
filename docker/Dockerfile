FROM node:18-alpine AS base
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3003
CMD ["npm", "run", "dev"]
