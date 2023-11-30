// refresh.js
const { access, refreshVerify } = require('../utils/jwt-util');
const jwt = require('jsonwebtoken');

const refresh = async (req, res) => {
    
    // access token과 refresh token의 존재 유무를 체크합니다.
    if (req.body.accessToken && req.body.refreshToken) {
        const refreshToken = req.body.refreshToken;
        const accessToken = req.body.accessToken;

        const decoded = jwt.decode(accessToken);

        // 디코딩 결과가 없으면 권한이 없음을 응답.(access token이 아니거나 잘못된 access token인 경우)
        if (decoded === null) {
            res.status(401).send({
                statusCode: 1060, 
                message: "wrong access token, no email info in access token" 
            });
        }
	
        /* access token의 decoding 된 값에서
        유저의 id를 가져와 refresh token을 검증합니다. */
        const refreshResult = await refreshVerify(refreshToken, decoded.email.member_email);
        // 1. refresh token이 만료된 경우 -> 새로 로그인
        if (refreshResult === false) {
            res.status(401).send({
                statusCode: 1070, 
                message: "refresh token expired" 
            });
        } else {
        // 2. refresh token은 만료되지 않은 경우 => 새로운 access token을 발급
            const newAccessToken = access(decoded.email);
            res.status(200).send({ // 새로 발급한 access token과 원래 있던 refresh token 모두 클라이언트에게 반환합니다.
                accessToken: newAccessToken,
                refreshToken: refreshToken,
                message: "new access token provided"
            });
        }
    } else { // access token 또는 refresh token이 헤더에 없는 경우
        res.status(404).send({
            statusCode: 1080,
            message: "no refresh token or access token in header"
        });
    }
};

module.exports = refresh;