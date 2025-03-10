require('dotenv').config();
var ping = require('ping');
const express = require('express');
const cors = require("cors");
const cron = require('node-cron');
const { Client } = require('@elastic/elasticsearch');

const app = express();
const PORT = process.env.PORT || 5004;

// 📌 ตั้งค่า Elasticsearch (ที่เครื่อง `10.2.114.76`)
const esClient = new Client({
    node: 'http://10.2.114.76:9200', // IP ของ ELK Server
    auth: {
        username: process.env.ELASTIC_USER || 'elastic',
        password: process.env.ELASTIC_PASS || 'changeme'
    }
});

// 📌 รายชื่อเซิร์ฟเวอร์ที่ต้อง Ping
const hosts = [
    '192.168.1.1', '192.168.1.11', '192.168.1.6', 
    '192.168.1.18', '192.168.1.9', '192.168.2.34'
];

// 📌 ฟังก์ชันบันทึก Log ไปที่ Elasticsearch
async function logToElasticsearch(host, alive) {
    try {
        const thailandTime = new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });
        await esClient.index({
            index: 'server_status',
            body: {
                timestamp: thailandTime, // 📌 แปลงเป็นเวลาไทย
                host: host,
                alive: alive
            }
        });
        console.log(`📌 Logged to Elasticsearch: ${host} - Alive: ${alive} - Time: ${thailandTime}`);
    } catch (error) {
        console.error('❌ Error logging to Elasticsearch:', error);
    }
}

// 📌 ตั้ง Cron Job ให้ Ping ทุก 5 นาที
cron.schedule('*/5 * * * *', async () => {
    for (let host of hosts) {
        let rs = await ping.promise.probe(host);
        await logToElasticsearch(rs.host, rs.alive);
    }
});

// 📌 API สำหรับ Ping แบบ Manual
app.get('/ping', async (req, res) => {
    let results = [];
    for (let host of hosts) {
        let rs = await ping.promise.probe(host);
        await logToElasticsearch(rs.host, rs.alive);
        results.push(rs);
    }
    res.json({ results });
});

// 📌 เปิดเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`✅ Server is running on port: ${PORT}`);
});
