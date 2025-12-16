const express = require('express')
const cors = require('cors');
require('dotenv').config()
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const jwt_key = process.env.JWT_KEY;


const MILLS_24H = 86400000;


const upload = multer({
  storage: multer.memoryStorage(),
  // limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files allowed'), false);
    }
    cb(null, true);
  }
});


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = process.env.MONGODB_URI;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});


const app = express()
app.use(cors({
  origin: [
    "http://localhost:5173",
    "https://import-export-lab.web.app",
    "https://import-export-lab.firebaseapp.com",
  ],
  credentials: true
}))
app.use(express.json())
app.use(cookieParser());
const port = 3000


const pick = (obj, keys) => Object.fromEntries(keys.map(k => [k, obj[k]]));


async function run() {
  // Connect the client to the server	(optional starting in v4.7)
  console.log("Database connecting...")
  await client.connect();
  console.log("Database connection successful...")
  // Send a ping to confirm a successful connection
  // await client.db("admin").command({ ping: 1 }); console.log("Pinged your deployment. You successfully connected to MongoDB!");

  const database = client.db('blood_link');
  const usersCol = database.collection('users');
  const donationCol = database.collection('donation');




  const verifyJWT = async (req, res, next) => {
    const user_token = req.cookies.user_token;
    if (!user_token) {
      return res.status(401).send({ success: false, message: "Unauthorized access.(a)" })
    }
    // console.log(user_token);
    const user_token_info = jwt.verify(user_token, jwt_key)
    if (user_token_info.email) {
      req.jwt_email = user_token_info.email;
      return next()
    }
    return res.status(401).send({ success: false, message: "Unauthorized access.(b)" })
  }

  const verifyJWTFetchUser = async (req, res, next) => {
    const user_token = req.cookies.user_token;
    if (!user_token) {
      return res.status(401).send({ success: false, message: "Unauthorized access." })
    }
    // console.log(user_token);
    const user_token_info = jwt.verify(user_token, jwt_key)
    if (user_token_info.email) {
      const userExists = await usersCol.findOne({ email: user_token_info.email })
      if (userExists == null) {
        return res.status(401).send({ success: false, message: "Unauthorized access." })
      }
      delete userExists.password;
      req.jwt_email = user_token_info.email;
      req.jwt_user = userExists;
      return next()
    }
    return res.status(401).send({ success: false, message: "Unauthorized access." })
  }


  app.get('/', (req, res) => {
    res.send('Hello World!')
  })


  app.post('/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded');

    try {
      const form = new FormData();
      form.append('image', req.file.buffer.toString('base64')); // ImageBB requires base64

      const response = await axios.post(`https://api.imgbb.com/1/upload?key=${process.env.IMAGEBB_API_KEY}`, form, {
        headers: form.getHeaders()
      });

      res.json({ success: true, url: response.data.data.url });
    } catch (err) {
      res.status(500).send({ success: false, message: err.message });
    }
  });

  app.post('/register', async (req, res) => {
    // console.log(req.body);
    const userExists = await usersCol.findOne({ email: req.body.email })
    // console.log(userExists);
    if (userExists != null) {
      return res.send({ success: false, message: "Email already in use." })
    }
    const user = {
      email: req.body.email,
      name: req.body.name,
      bloodGroup: req.body.bloodGroup,
      photo: req.body.photo,
      division: req.body.division,
      district: req.body.district,
      upazila: req.body.upazila,
      password: bcrypt.hashSync(req.body.password, 10),
      status: "active",
      role: "donor",
      registerAt: new Date(),
    }
    const insert = await usersCol.insertOne(user)
    // console.log(insert);
    if (insert.insertedId) {
      const userExists = await usersCol.findOne({ email: req.body.email })
      // console.log(userExists);
      if (userExists == null) {
        return res.send({ success: false, message: "User not found." })
      }
      delete userExists.password;

      const user_token = jwt.sign({ email: userExists.email }, jwt_key, { expiresIn: 24 * 60 * 60 });
      res.cookie('user_token', user_token, { maxAge: MILLS_24H, httpOnly: true });

      return res.send({ success: true, message: "Register success...", user: userExists })
    }
    res.send({ success: false, message: "Something went wrong..." })
  })



  app.post('/login', async (req, res) => {
    // console.log(req.body);
    const userExists = await usersCol.findOne({ email: req.body.email })
    // console.log(userExists);
    if (userExists == null) {
      return res.send({ success: false, message: "User not found.", })
    }


    // console.log(req.body.password);

    if (bcrypt.compareSync(req.body.password, userExists.password) === true) {
      delete userExists.password;
      const user_token = jwt.sign({ email: userExists.email }, jwt_key, { expiresIn: 24 * 60 * 60 });
      res.cookie('user_token', user_token, { maxAge: MILLS_24H, httpOnly: true });
      return res.send({ success: true, message: "Login success...", user: userExists, })
    }
    res.send({ success: false, message: "Something went wrong...", })
  })


  app.get('/me', verifyJWTFetchUser, async (req, res) => {
    if (req.jwt_user) {
      return res.send({ message: "Login success...", user: req.jwt_user, success: true })
    }
    return res.send({ success: false, message: "Something went wrong...", })
    // const user_token = req.cookies.user_token;
    // if (!user_token) {
    //   return res.send({ message: "User not found." })
    // }
    // // console.log(user_token);
    // const user_token_info = jwt.verify(user_token, jwt_key)
    // if (user_token_info.email) {
    //   const userExists = await usersCol.findOne({ email: user_token_info.email })
    //   if (userExists == null) {
    //     return res.send({ message: "User not found." })
    //   }
    //   delete userExists.password;
    //   return res.send({ message: "Login success...", user: userExists })
    // }
    // res.send({ message: "Something went wrong..." })
  })


  app.get('/logout', async (req, res) => {
    res.cookie('user_token', '', { maxAge: MILLS_24H, httpOnly: true });
    res.send({ success: true, message: "Logout success...", })
  })


  app.post("/create_donation_request", verifyJWTFetchUser, async (req, res) => {
    // console.log(req);
    if (req.jwt_user.status != 'active') {
      return res.status(500).send({ success: false, message: "Request Failed.", })
    }
    const req_body = req.body;
    req_body.status = 'pending';
    req_body.createdAt = new Date();

    const result = await donationCol.insertOne(req_body);
    if (result.insertedId) {
      return res.send({ message: "Request created success.", success: true })
    }
    return res.status(500).send({ message: "Request Failed.", success: false })

    // {
    //   requester_name: 'Abdul Alo',
    //     requester_email: 'arpxnm001@gmail.com',
    //       receiver_name: 'Abdul Awal',
    //         bloodGroup: 'B+',
    //           division: 'Chattagram',
    //             district: 'Comilla',
    //               upazila: 'Debidwar',
    //                 hospital_name: 'dfgfdgfg',
    //                   full_address: '110/1, uttarkhan dhaka 1230',
    //                     donation_date: '2002-03-31',
    //                       donation_time: '12:45',
    //                         request_message: 'vvv'
    // }
  })

  app.get("/my-donation-requests", verifyJWT, async (req, res) => {
    const query = { requester_email: req.jwt_email };

    const cursor = donationCol.find(query).sort({ createdAt: -1 })

    if (req.query.limit) {
      cursor.limit(parseInt(req.query.limit))
    }

    const data = await cursor.toArray();
    res.send(data)
  })

  app.get("/donation/:reqId", async (req, res) => {
    const { reqId } = req.params;
    const query = { _id: new ObjectId(reqId) };

    const donationReq = await donationCol.findOne(query);

    res.send(donationReq)

    // if(req.jwt_user.role=='admin' || donationReq.requester_email==req.jwt_email){
    //     const result=await donationCol.deleteOne(query)
    //     return res.send({message:result.deletedCount>0?"Deleted success.":"Error deleting the request"})
    // }

    // return res.send(403).send({message:"Access restricted."})
  })


  app.delete("/donation/:reqId", verifyJWTFetchUser, async (req, res) => {
    const { reqId } = req.params;
    const query = { _id: new ObjectId(reqId) };

    const donationReq = await donationCol.findOne(query);

    if (req.jwt_user.role === 'admin' || donationReq.requester_email === req.jwt_email) {
      const result = await donationCol.deleteOne(query)
      return res.send({ message: result.deletedCount > 0 ? "Deleted success." : "Error deleting the request", success: result.deletedCount > 0 })
    }

    return res.send(403).send({ message: "Access restricted.", success: false })
  })

  app.post("/edit_profile", verifyJWTFetchUser, async (req, res) => {
    const query = { email: req.jwt_email };
    const data = {
      name: req.body.name,
      photo: req.body.photo,
      bloodGroup: req.body.bloodGroup,
      division: req.body.division,
      district: req.body.district,
      upazila: req.body.upazila
    }
    const result = await usersCol.updateOne(query, { $set: data })
    if (result.modifiedCount) {
      const userExists = await usersCol.findOne(query)
      delete userExists.password;
      return res.send({ message: "Profile updated", success: true, user: userExists })
    }
    return res.send({ message: "Profile update failed", success: false })
  })


  app.listen(port, () => {
    console.log(`App listening on port ${port}`)
  })

}

run().catch(console.dir)