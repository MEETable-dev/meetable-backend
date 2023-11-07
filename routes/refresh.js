// refresh.js
const { access, verify, refreshVerify } = require('../utils/jwt-util');
const jwt = require('jsonwebtoken');

const refresh = async (req, res) => {
    // access token과 refresh token의 존재 유무를 체크합니다.
    if (req.headers.authorization && req.headers.refresh) {
        const authToken = req.headers.authorization.split('Bearer ')[1];
        const refreshToken = req.headers.refresh;

        // access token 검증 -> expired여야 함.
        const authResult = verify(authToken);

        // access token 디코딩하여 user의 정보를 가져옵니다.
        const decoded = jwt.decode(authToken);
	
        // 디코딩 결과가 없으면 권한이 없음을 응답.(access token이 아니거나 잘못된 access token인 경우)
        if (decoded === null) {
            res.status(401).send({
                statusCode: 1060, 
                data: {},
                message: "wrong access token" 
            });
        }
	
        /* access token의 decoding 된 값에서
        유저의 id를 가져와 refresh token을 검증합니다. */
        const refreshResult = refreshVerify(refreshToken, decoded.email);

        // 재발급을 위해서는 access token이 만료되어 있어야합니다.
        if (authResult.ok === false && authResult.message === 'jwt expired') {
            // 1. access token이 만료되고, refresh token도 만료 된 경우 => 새로 로그인해야합니다.
            if (refreshResult.ok === false) {
                res.status(401).send({
                    statusCode: 1070, 
                    data: {},
                    message: "refresh token expired" 
                });
            } else {
            // 2. access token이 만료되고, refresh token은 만료되지 않은 경우 => 새로운 access token을 발급
                const newAccessToken = access(decoded.email);

                res.status(200).send({ // 새로 발급한 access token과 원래 있던 refresh token 모두 클라이언트에게 반환합니다.
                    data: {
                        accessToken: newAccessToken,
                        refreshToken: refreshToken
                    }
                });
            }
        } else {
            // 3. access token이 만료되지 않은경우 => refresh 할 필요가 없습니다.
            res.status(400).send({
                statusCode: 1075, 
                data: {},
                message: "access token is not expired"
            });
        }
    } else { // access token 또는 refresh token이 헤더에 없는 경우
        res.status(404).send({
            statusCode: 1080, 
            data: {},
            message: "no refresh token or access token in header"
        });
    }
};

module.exports = refresh;