# BloodLink - A blood donation management system
## This is server repository
- Client Repository [https://github.com/AWAL9R/Blood-donation-Webapp-client.git](https://github.com/AWAL9R/Blood-donation-Webapp-client.git)
## How to install?
Step 1:
````bash
git clone https://github.com/AWAL9R/Blood-donation-Webapp-client.git
````
Step 2:
````bash
cd Blood-donation-Webapp-client
````
Step 3:
Create `.env` file with these key values:
````env
IMAGEBB_API_KEY=IMAGEBB_API_KEY
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.x53dmvk.mongodb.net/?appName=Cluster0
JWT_KEY=String to secure jwt keys
STRIPE_SECRET_KEY=<Stripe_Payment_key>
CLIENT_SIDE_URL=<Client side url. ex. https://blood-link-awal9r.web.app>
````
Step 4:
````bash
npm install
````
Step 5:
````bash
npm index.js
````