require("dotenv").config();
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const redisClient = require('./redis');
const secret = process.env.SECRET_KEY;

module.exports = {
  access: (email) => { // access token 발급
    const payload = { // access token에 들어갈 payload
      email: email,
    };

    return jwt.sign(payload, secret, { // secret으로 sign하여 발급하고 return
      algorithm: 'HS256', // 암호화 알고리즘
      expiresIn: '1d', 	  // 유효기간
    });
  },
  verify: (token) => { // access token 검증
    let decoded = null;
    try {
      decoded = jwt.verify(token, secret);
      return {
        ok: true,
        email: decoded
      };
    } catch (err) {
      return {
        ok: false,
        message: err.message,
      };
    }
  },
  refresh: () => { // refresh token 발급
    return jwt.sign({}, secret, { // refresh token은 payload 없이 발급
      algorithm: 'HS256',
      expiresIn: '14d',
    });
  },
  refreshVerify: async (token, memberEmail) => { // refresh token 검증
    /* redis 모듈은 기본적으로 promise를 반환하지 않으므로,
       promisify를 이용하여 promise를 반환하게 해줍니다.*/
    const getAsync = promisify(redisClient.get).bind(redisClient);
    
    try {
      const data = await getAsync(memberEmail); // refresh token 가져오기
      console.log(data)
      console.log(token)
      if (token === data) {
        try {
          return jwt.verify(token, secret);
        } catch (err) {
          return false;
        }
      } else {
        return false;
      }
    } catch (err) {
      return false;
    }
  },
  logout: async (email) => {
    console.log(email)
    const existAsync = promisify(redisClient.exists).bind(redisClient);
    const delAsync = promisify(redisClient.del).bind(redisClient);
    try {
      const exists = await existAsync(email);
      if(exists) await delAsync(email);
      else return false;
    } catch (err) {
      return false;
    }
  },
  email: (email) => {
    const payload = { // access token에 들어갈 payload
      email: email,
    };

    return jwt.sign(payload, secret, { // secret으로 sign하여 발급하고 return
      algorithm: 'HS256', // 암호화 알고리즘
      expiresIn: '10m', 	  // 유효기간
    });
  },
  emailVerify: (token) => {
    try {
      return jwt.verify(token, secret);
    } catch(err) {
      return false;
    }
  },
  sign: (name, emailToken, pwd) => {
    const payload = { // access token에 들어갈 payload
      name: name,
      email: emailToken,
      pwd: pwd,
    };

    return jwt.sign(payload, secret, { // secret으로 sign하여 발급하고 return
      algorithm: 'HS256', // 암호화 알고리즘
      expiresIn: '10m', 	  // 유효기간
    });
  },
  signVerify: (token) => {
    try {
      return jwt.verify(token, secret);
    } catch(err) {
      return false;
    }
  }
};