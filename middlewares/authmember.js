const { verify } = require('../utils/jwt-util');

const authMember = (req, res, next) => {
    if (req.headers === undefined) {
        res.status(400).send({
            statusCode: 1200,
            message: "no header",
          });
    } else {
        if (req.headers.authorization.includes('@')) {
            // 비회원
            req.isMember = false;
            req.nonmemberId = req.headers.authorization.split('@')[1];
            next();
        } else {
            // 회원
            const token = req.headers.authorization.split('Bearer ')[1]; // header에서 access token을 가져옵니다.
            const result = verify(token); // token을 검증합니다.
            if (result.ok) { // token이 검증되었으면 req에 값을 세팅하고, 다음 콜백함수로 갑니다.
                req.isMember = true;
                req.memberId = result.email.email.member_id
                req.nickname = result.email.email.member_name;
                req.email = result.email.email.member_email;
                // console.log(result)
                // console.log(req.isMember)
                // console.log(req.memberId)
                // console.log(req.nickname)
                next();
            } else { // 검증에 실패하거나 토큰이 만료되었다면 클라이언트에게 메세지를 담아서 응답합니다.
                res.status(401).send({
                    statusCode: 1000,
                    message: result.message, // jwt가 만료되었다면 메세지는 'jwt expired'입니다.
                });
            }
        }
    }
  };



module.exports = authMember;