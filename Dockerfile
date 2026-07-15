FROM node:20-bookworm-slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
# Browser validation runs inside the web container. Keep the Chromium binary
# in the image so generations never depend on a per-request browser install.
RUN npx playwright install --with-deps chromium
COPY . .
RUN npm run build
EXPOSE 9010
CMD ["npm", "start"]
