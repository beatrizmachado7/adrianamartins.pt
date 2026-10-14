# Imagem para publicar o site + painel (Render, Railway, Fly.io ou um VPS com Docker)
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY index.js ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
# a base de dados e as cópias de segurança ficam num disco persistente montado em /data
ENV DATA_DIR=/data PORT=3000 TRUST_PROXY=true
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "index.js"]
