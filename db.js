const mysql = require('mysql2');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// const pool = {
//     init: () => {
//         return mysql.createConnection({
//             host: process.env.DB_HOST,
//             port: process.env.DB_PORT,
//             user: process.env.DB_USER,
//             password: process.env.DB_PASSWORD,
//             database: process.env.DB_DATABASE,
//             waitForConnections: true,
//             connectionLimit: 10,
//             queueLimit: 0,
//         });
//       },
//       open: (con) => {
//         con.connect((err) => {
//           if (err) {
//             console.log("mysql 연결 실패", err);
//           } else {
//             console.log("mysql 연결성공");
//           }
//         });
//       },
//       close: (con) => {
//         con.end((err) => {
//           if (err) {
//             console.log("mysql 종료 실패", err);
//           } else {
//             console.log("mysql 종료!");
//           }
//         });
//       },
// }

module.exports = pool;