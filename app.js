const express = require("express");
const path = require("path");
const bcrypt = require("bcrypt");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const app = express();
app.use(express.json());
module.exports = app;
const dbPath = path.join(__dirname, "twitterClone.db");

let db = null;
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwt.verify(jwtToken, "secret", (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();
app.post("/register", async (request, response) => {
  const { username, name, password, gender } = request.body;
  const encryptPassword = await bcrypt.hash(password, 10);
  const query = `SELECT * FROM user WHERE username='${username}';`;
  const result = await db.get(query);

  if (result === undefined && password.length >= 6) {
    const createQuery = `INSERT INTO user (username,name, password, gender)
        VALUES ('${username}','${name}','${encryptPassword}','${gender}')`;
    await db.run(createQuery);
    response.status(200);
    response.send("User created successfully");
  } else if (password.length < 6) {
    response.status(400);
    response.send("Password is too short");
  } else {
    response.status(400);
    response.send("User already exists");
  }
});
// login
app.post("/login/", authenticateToken, async (request, response) => {
  const { username, password } = request.body;

  const query = `SELECT * FROM user WHERE username='${username}';`;
  const result = await db.get(query);
  if (result === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const exist = await bcrypt.compare(password, result.password);
    if (exist === true) {
      const jsonData = { username: username };
      const jwtToken = jwt.sign(jsonData, "secret");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

// get tweets
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query1 = `SELECT * FROM user WHERE username='${username}'`;
  const id = await db.all(query1);
  const query2 = `SELECT * FROM follower WHERE follower_user_id='${id[0].user_id}';`;
  const final = await db.all(query2);
  const list = [];
  for (let i of final) {
    list.push(i.following_user_id);
  }
  const values = list.join(",");

  const query3 = `SELECT username as username,
  tweet as tweet,
  date_time as dateTime
   FROM user NATURAL JOIN tweet WHERE user_id IN (${values})
  ORDER BY 
  date_time DESC
  LIMIT 4 OFFSET 0
     ;`;
  const result = await db.all(query3);
  response.send(result);
});

// list of followed users
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query1 = `SELECT * FROM user WHERE username='${username}'`;
  const id = await db.all(query1);
  const query2 = `SELECT * FROM follower WHERE follower_user_id='${id[0].user_id}';`;
  const final = await db.all(query2);
  const list = [];
  for (let i of final) {
    list.push(i.following_user_id);
  }

  const values = list.join(",");

  const query3 = `SELECT DISTINCT username as username

     FROM user NATURAL JOIN tweet WHERE user_id IN (${values})

       ;`;
  const result = await db.all(query3);
  response.send(result);
});

// list of follwers for users
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query1 = `SELECT * FROM user WHERE username='${username}'`;
  const id = await db.all(query1);
  const query2 = `SELECT * FROM follower WHERE following_user_id='${id[0].user_id}';`;
  const final = await db.all(query2);
  const list = [];
  for (let i of final) {
    list.push(i.follower_user_id);
  }

  const values = list.join(",");

  const query3 = `SELECT DISTINCT username as username

     FROM user NATURAL JOIN tweet WHERE user_id IN (${values})

       ;`;
  const result = await db.all(query3);
  response.send(result);
});
// tweets,likes,replies
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { username } = request;

  const { tweetId } = request.params;

  const query1 = `SELECT * FROM user WHERE username='${username}'`;
  const id = await db.all(query1);
  const query2 = `SELECT * FROM follower WHERE follower_user_id='${id[0].user_id}';`;
  const final = await db.all(query2);
  const list = [];
  for (let i of final) {
    list.push(i.following_user_id);
  }
  const values = list.join(",");

  const query3 = `SELECT tweet_id

     FROM user NATURAL JOIN tweet WHERE user_id IN (${values})

       ;`;

  const tweetlist = [];
  const result = await db.all(query3);
  for (let i of result) {
    tweetlist.push(i.tweet_id);
  }

  if (!tweetlist.includes(parseInt(tweetId))) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    const query = `SELECT tweet,date_time as dateTime FROM tweet WHERE tweet_id='${tweetId}'`;
    const tweetInfo = await db.get(query);
    const query1 = `SELECT COUNT(tweet_id) as replies FROM reply WHERE tweet_id='${tweetId}'`;
    const replyInfo = await db.all(query1);
    const query3 = `SELECT COUNT(tweet_id) as likes FROM like WHERE tweet_id='${tweetId}'`;
    const likeInfo = await db.all(query3);
    const obj = {
      tweet: tweetInfo.tweet,
      likes: likeInfo[0].likes,
      replies: replyInfo[0].replies,
      dateTime: tweetInfo.dateTime,
    };
    response.send(obj);
  }
});

// followed likes

app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;

    const { tweetId } = request.params;

    const query1 = `SELECT * FROM user WHERE username='${username}'`;
    const id = await db.all(query1);
    const query2 = `SELECT * FROM follower WHERE follower_user_id='${id[0].user_id}';`;
    const final = await db.all(query2);
    const list = [];
    for (let i of final) {
      list.push(i.following_user_id);
    }
    const values = list.join(",");

    const query3 = `SELECT tweet_id

     FROM user NATURAL JOIN tweet WHERE user_id IN (${values})

       ;`;

    const tweetlist = [];
    const result = await db.all(query3);
    for (let i of result) {
      tweetlist.push(i.tweet_id);
    }

    if (!tweetlist.includes(parseInt(tweetId))) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const query = `SELECT * FROM user LEFT JOIN like ON user.user_id=like.user_id WHERE tweet_id='${tweetId}';`;
      const result = await db.all(query);
      let list = [];
      for (let i of result) {
        list.push(i.username);
      }
      response.send({ likes: list });
    }
  }
);

//replies
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;

    const { tweetId } = request.params;

    const query1 = `SELECT * FROM user WHERE username='${username}'`;
    const id = await db.all(query1);
    const query2 = `SELECT * FROM follower WHERE follower_user_id='${id[0].user_id}';`;
    const final = await db.all(query2);
    const list = [];
    for (let i of final) {
      list.push(i.following_user_id);
    }
    const values = list.join(",");

    const query3 = `SELECT tweet_id

     FROM user NATURAL JOIN tweet WHERE user_id IN (${values})

       ;`;

    const tweetlist = [];
    const result = await db.all(query3);
    for (let i of result) {
      tweetlist.push(i.tweet_id);
    }

    if (!tweetlist.includes(parseInt(tweetId))) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const query = `SELECT * FROM user LEFT JOIN reply ON user.user_id=reply.user_id WHERE tweet_id='${tweetId}';`;
      const result = await db.all(query);
      console.log(result);
      let list = [];
      for (let i of result) {
        let obj = {
          name: i.username,
          reply: i.reply,
        };
        list.push(obj);
      }
      response.send({ replies: list });
    }
  }
);
// user tweets
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const query1 = `SELECT * FROM user WHERE username='${username}'`;
  const id = await db.all(query1);
  const query = `SELECT * FROM tweet WHERE user_id='${id[0].user_id}'`;
  const tweetInfo = await db.all(query);

  const list = [];
  for (let i of tweetInfo) {
    list.push(i.tweet_id);
  }
  const ans = [];
  let count = 0;
  for (let i of list) {
    const query2 = `SELECT COUNT(reply) as replies FROM reply WHERE tweet_id=${i}`;
    const replyInfo = await db.all(query2);
    const query3 = `SELECT COUNT(tweet_id) as likes FROM like WHERE tweet_id=${i}`;
    const likeInfo = await db.all(query3);
    const obj = {
      tweet: tweetInfo[count].tweet,
      likes: likeInfo[0].likes,
      replies: replyInfo[0].replies,
      dateTime: tweetInfo[count].date_time,
    };
    ans.push(obj);
    count = count + 1;
  }

  response.send(ans);
});

// create tweet
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { tweet } = request.body;

  const query = `INSERT INTO tweet (tweet)
      VALUES('${tweet}');`;
  const result = await db.run(query);
  response.send("Created a Tweet");
});

// delete
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const query1 = `SELECT * FROM user WHERE username='${username}'`;
    const id = await db.get(query1);

    const query = `SELECT * FROM tweet WHERE user_id='${id.user_id}'`;
    const result = await db.all(query);
    const list = [];
    for (let i of result) {
      list.push(i.tweet_id);
    }
    if (!list.includes(parseInt(tweetId))) {
      response.status(401);
      response.send("Invalid Request");
    } else {
      const del = `DELETE FROM tweet WHERE tweet_id='${tweetId}'`;
      const ans = await db.run(del);
      response.send("Tweet Removed");
    }
  }
);
