require('dotenv').config()
const express = require('express')
const cors = require('cors');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const jwt_key = process.env.JWT_KEY;
const CLIENT_SIDE_URL = process.env.CLIENT_SIDE_URL;

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
  const fundingCol = database.collection('funding');

  //lets create some dummy users

  // for (let i = 0; i < 100; i++) {
  //   await usersCol.insertOne({
  //     "email": "dummy.user."+i+"@gmail.com",
  //     "name": "Abdul A"+i,
  //     "bloodGroup": "B+",
  //     "photo": "https://i.ibb.co/S4bdkdcd/1a24b5d93696.jpg",
  //     "division": "Dhaka",
  //     "district": "Dhaka",
  //     "upazila": "Savar",
  //     "password": "$2b$10$su.mlql0RB6U5lEkR8D.8e0.V.dHg4O2ZPIWQe.dnX3IKcbu89.fG",
  //     "status": "active",
  //     "role": "donor",
  //     "registerAt": {
  //       "$date": "2025-12-17T15:32:18.121Z"
  //     }
  //   })
  // }

  // lets create some dummy donation requests

  // for (let i = 0; i < 100; i++) {
  //   await donationCol.insertOne({
  //     "requester_name": "Kaka Official",
  //     "requester_email": "arlendudley298@gmail.com",
  //     "receiver_name": "Jesmin Akter-" + i,
  //     "bloodGroup": "A+",
  //     "division": "Mymensingh",
  //     "district": "Mymensingh",
  //     "upazila": "Bhaluka",
  //     "hospital_name": "Chandina hospital-" + i,
  //     "full_address": "110/1, uttarkhan dhaka 1230",
  //     "donation_date": "2025-12-20",
  //     "donation_time": "20:07",
  //     "request_message": "Delivery Operation-" + i,
  //     "status": "pending",
  //     "createdAt": {
  //       "$date": "2025-12-16T14:05:09.051Z"
  //     },

  //   })
  // }




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

  const requireAdmin = (req, res, next) => {
    if (req.jwt_user.role != "admin") {
      return res.status(403).send({ success: false, message: "Unauthorized access" })
    }
    return next()
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
      return res.send({ success: true, message: "Request created success.", id: result.insertedId })
    }
    return res.status(500).send({ success: false, message: "Request Failed.", })

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

    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;
    cursor.limit(limit).skip(skip)

    const result = await cursor.toArray()
    const count = await donationCol.countDocuments(query)
    res.send({ success: true, data: result, totalMatch: count })
  })

  app.get("/pending-donation-requests", async (req, res) => {
    const query = { status: 'pending' };

    const cursor = donationCol.find(query).sort({ createdAt: -1 })

    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;
    cursor.limit(limit).skip(skip)

    const result = await cursor.toArray()
    const count = await donationCol.countDocuments(query)
    res.send({ success: true, data: result, totalMatch: count })
  })

  app.get("/all-donation-request", async (req, res) => {
    const query = {};

    if (req.query.status && req.query.status != 'all') {
      query.status = req.query.status;
    }

    const cursor = donationCol.find(query).sort({ createdAt: -1 })

    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;
    cursor.limit(limit).skip(skip)

    const result = await cursor.toArray()
    const count = await donationCol.countDocuments(query)
    res.send({ success: true, data: result, totalMatch: count })
  })

  app.get("/donation/:reqId", async (req, res) => {
    const { reqId } = req.params;
    const query = { _id: new ObjectId(reqId) };

    const donationReq = await donationCol.findOne(query);
    // console.log(donationReq);

    res.send({ success: true, data: donationReq })

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
      return res.send({ success: result.deletedCount > 0, message: result.deletedCount > 0 ? "Deleted success." : "Error deleting the request", })
    }

    return res.send(403).send({ success: false, message: "Access restricted.", })
  })

  app.patch("/donation-status/:reqId", verifyJWTFetchUser, async (req, res) => {
    const { reqId } = req.params;
    const query = { _id: new ObjectId(reqId) };

    const donationReq = await donationCol.findOne(query);

    const updates = {}

    if (req.body.setStatus != null && ['done', 'canceled'].includes(req.body.setStatus)) {
      updates.status = req.body.setStatus;
    }

    if (req.jwt_user.role === 'admin' || req.jwt_user.role === 'volunteer' || donationReq.requester_email === req.jwt_email) {
      const result = await donationCol.updateOne(query, { $set: updates })
      return res.send({ success: result.modifiedCount > 0, message: result.modifiedCount > 0 ? `success` : `failed` })
    }

    return res.send(403).send({ success: false, message: "Access restricted.", })
  })

  app.patch("/donation-accept/:reqId", verifyJWTFetchUser, async (req, res) => {
    const { reqId } = req.params;
    const query = { _id: new ObjectId(reqId) };

    const donationReq = await donationCol.findOne(query);

    const updates = {}

    updates.donor = {
      name: req.jwt_user.name,
      email: req.jwt_user.email,
    }
    updates.status = 'in-progress';

    // if (req.jwt_user.role === 'admin' || req.jwt_user.role === 'volunteer' || donationReq.requester_email === req.jwt_email) {
    const result = await donationCol.updateOne(query, { $set: updates })
    return res.send({ success: result.modifiedCount > 0, message: result.modifiedCount > 0 ? `success` : `failed` })
    // }

    // return res.send(403).send({ success: false, message: "Access restricted.", })
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
      return res.send({ success: true, message: "Profile updated", user: userExists })
    }
    return res.send({ success: false, message: "Profile update failed", })
  })


  app.get("/users", verifyJWTFetchUser, requireAdmin, async (req, res) => {
    const query = {};
    if (req.query.status && req.query.status != 'all') {
      query.status = req.query.status;
    }
    const cursor = usersCol.find(query).project({ password: 0 })

    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;
    cursor.limit(limit).skip(skip)

    const result = await cursor.toArray()
    const count = await usersCol.countDocuments(query)
    res.send({ success: true, data: result, totalMatch: count })
  })

  app.get("/search-users", async (req, res) => {
    const query = {};
    if (req.query.bloodGroup) {
      query.bloodGroup = req.query.bloodGroup;
    }
    if (req.query.district) {
      query.district = req.query.district;
    }
    if (req.query.upazila) {
      query.upazila = req.query.upazila;
    }


    const cursor = usersCol.find(query).project({ password: 0, status: 0, role: 0, registerAt: 0 })

    const limit = req.query.limit ? parseInt(req.query.limit) : 10;
    const skip = req.query.skip ? parseInt(req.query.skip) : 0;
    cursor.skip(skip).limit(limit)

    const result = await cursor.toArray()
    const count = await usersCol.countDocuments(query)
    res.send({ success: true, data: result, totalMatch: count })
  })

  app.post("/edit-user/:id", verifyJWTFetchUser, requireAdmin, async (req, res) => {
    const query = { _id: new ObjectId(req.params.id) };

    const updates = {}

    if (req.body.setStatus != null && ['blocked', 'active'].includes(req.body.setStatus)) {
      updates.status = req.body.setStatus;
    }
    if (req.body.setRole != null && ['admin', 'donor', 'volunteer'].includes(req.body.setRole)) {
      updates.role = req.body.setRole;
    }


    const result = await usersCol.updateOne(query, { $set: updates })
    res.send({ success: result.modifiedCount > 0, message: result.modifiedCount > 0 ? `success` : `failed` })
  })


  app.post("/funding", verifyJWTFetchUser, async (req, res) => {

    const amount = Number(req.body.amount || '1') * 100;

    const funding = await fundingCol.insertOne({
      name: req.jwt_user.name,
      amount: amount,
      createdAt: new Date(),
      status: "pending"
    })

    const session = await stripe.checkout.sessions.create({
      customer_email: req.jwt_email,
      line_items: [
        {
          // Provide the exact Price ID (for example, price_1234) of the product you want to sell
          price_data: {
            currency: "USD",
            unit_amount: amount,
            product_data: {
              name: "funding",
            }
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      metadata: {
        user_email: req.jwt_email,
        funding_id: funding.insertedId.toString()
      },
      success_url: `${CLIENT_SIDE_URL}/funding?success=true&id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_SIDE_URL}/funding?success=false`
    });

    res.send({ url: session.url });
  })

  app.post("/funding-success", verifyJWTFetchUser, async (req, res) => {

    const id = req.body.id;

    const session = await stripe.checkout.sessions.retrieve(id);
    console.log(session);

    if (session.payment_status == "paid") {
      const query = { _id: new ObjectId(session.metadata.funding_id) }

      fundingCol.updateOne(query, { status: 'paid' })
      return res.send({ success: false })
    }


    return res.send({ success: false })
  })

  app.get("/fundings", verifyJWT, async (req, res) => {

    const result=await fundingCol.find({status:"paid"}).toArray()

    return res.send({ success: true, data: result })
  })




  app.listen(port, () => {
    console.log(`App listening on port ${port}`)
  })

}

run().catch(console.dir)