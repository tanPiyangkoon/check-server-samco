FROM node:18

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# ✅ ติดตั้ง ping + set capability
RUN apt-get update && \
    apt-get install -y iputils-ping libcap2-bin && \
    setcap cap_net_raw+ep /usr/bin/ping || true

EXPOSE 5004

CMD ["node", "server.js"]

