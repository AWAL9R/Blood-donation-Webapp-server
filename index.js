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

      res.json({ url: response.data.data.url });
    } catch (err) {
      res.status(500).send(err.message);
    }
  });

  app.post('/register', async (req, res) => {
    // console.log(req.body);
    const userExists = await usersCol.findOne({ email: req.body.email })
    // console.log(userExists);
    if (userExists != null) {
      return res.send({ message: "Email already in use." })
    }
    const user = {
      email: req.body.email,
      name: req.body.name,
      bloodGroup: req.body.bloodGroup,
      photo: req.body.photo,
      division: req.body.division,
      district: req.body.district,
      upazila: req.body.upazila,
      password: bcrypt.hashSync(req.body.password, 10)
    }
    const insert = await usersCol.insertOne(user)
    // console.log(insert);
    if (insert.insertedId) {
      const userExists = await usersCol.findOne({ email: req.body.email })
      // console.log(userExists);
      if (userExists == null) {
        return res.send({ message: "User not found." })
      }
      delete userExists.password;

      const user_token = jwt.sign({ email: userExists.email }, jwt_key, { expiresIn: 24 * 60 * 60 });
      res.cookie('user_token', user_token, { maxAge: 900000, httpOnly: true });

      return res.send({ message: "Register success...", user: userExists })
    } else {
      return res.send({ message: "Operation failed." })
    }
  })



  app.post('/login', async (req, res) => {
    // console.log(req.body);
    const userExists = await usersCol.findOne({ email: req.body.email })
    // console.log(userExists);
    if (userExists == null) {
      return res.send({ message: "User not found." })
    }

    
    // console.log(req.body.password);

    if (bcrypt.compareSync(req.body.password, userExists.password) === true) {
      delete userExists.password;
      const user_token = jwt.sign({ email: userExists.email }, jwt_key, { expiresIn: 24 * 60 * 60 });
      res.cookie('user_token', user_token, { maxAge: 900000, httpOnly: true });
      return res.send({ message: "Login success...", user: userExists })
    }
  })


  app.get('/me', async (req, res) => {
    const user_token = req.cookies.user_token;
    if(!user_token){
      return res.send({ message: "User not found." })
    }
    // console.log(user_token);
    const user_token_info = jwt.verify(user_token, jwt_key)
    if (user_token_info.email) {
      const userExists = await usersCol.findOne({ email: user_token_info.email })
      if (userExists == null) {
        return res.send({ message: "User not found." })
      }
      delete userExists.password;
      return res.send({ message: "Login success...", user: userExists })
    }
  })


  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
  })

}

run().catch(console.dir)