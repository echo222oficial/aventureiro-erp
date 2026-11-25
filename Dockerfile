FROM node:22-alpine
WORKDIR /app
COPY server.js ./
COPY public ./public
ENV PORT=3000 DATA_DIR=/data
CMD ["node","--disable-warning=ExperimentalWarning","server.js"]
