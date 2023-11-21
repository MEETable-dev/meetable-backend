const dotenv = require('dotenv');
const redis = require('redis');
dotenv.config();

const redisClient = redis.createClient({
    url: `redis://${process.env.REDIS_USERNAME}:${process.env.REDIS_PWD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}/0`,
   legacyMode: true, // 반드시 설정
});


(async () => {
    await redisClient.connect();
})();

redisClient.on('connect', () => console.log('::> Redis Client Connected'));
redisClient.on('error', (err) => console.log('<:: Redis Client Error', err));

module.exports = redisClient