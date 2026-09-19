FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production PORT=3002
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY index.js start.mjs ./
USER node
EXPOSE 3002
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3002/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "start.mjs"]
