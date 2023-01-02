const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SK);

const port = process.env.PORT || 5000;

const app = express();

//middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.w5am0gy.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri)
const client = new MongoClient(uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send("Unauthorized access");
    }
    const token = authHeader.split(" ")[1];
    // console.log(token);
    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: "forbidden access" });
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        //all collections
        const brandsCollection = client.db("SellPhone").collection("brands");
        const allProductsCollection = client
            .db("SellPhone")
            .collection("allProducts");
        const ordersCollection = client.db("SellPhone").collection("orders");
        const usersCollection = client.db("SellPhone").collection("users");
        const allAdvertiseCollection = client
            .db("SellPhone")
            .collection("allAdvertise");
        const paymentCollections = client.db("SellPhone").collection("payment");

        app.get("/brands", async (req, res) => {
            const query = {};
            const op = await brandsCollection.find(query).toArray();
            res.send(op);
        });

        app.get("/advrtiseMent", async (req, res) => {
            const query = {};
            const op = await allAdvertiseCollection.find(query).limit(3).sort({_id:-1}).toArray();
            res.send(op);
        });

        app.get("/all-products", async (req, res) => {
           
            const search = req.query.search
            console.log(search)
            let query = {}

             if(search){
                query = {
                    $text:{
                        $search:search
                    }
                };

             }
            const cursor = allProductsCollection.find(query);
            const allProducts = await cursor.toArray();

            res.send(allProducts);
        });

        app.post("/add-products", async (req, res) => {
            // let query = {};

            const product = req.body;
            // console.log(user)
            const result = await allProductsCollection.insertOne(product);
            res.send(result);
        });

        app.post("/payments", async (req, res) => {
            const payment = req.body;
            const result = await paymentCollections.insertOne(payment);

            const id = payment.bookingId;
            const filter = { _id: ObjectId(id) };
            console.log(filter);
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionID: payment.transactionID,
                },
            };
            const updatedResult = await ordersCollection.updateOne(
                filter,
                updatedDoc
            );
            res.send(result);
        });

        app.get("/all-products/:id", async (req, res) => {
            const id = req.params.id;

            const query = { _id: ObjectId(id) };
            const details = await allProductsCollection.findOne(query);

            res.send(details);
        });

        app.put(
            "/all-products/disable/:id",

            async (req, res) => {
                const id = req.params.id;
                const filter = { _id: ObjectId(id) };
                const option = { upsert: true };
                const updatedDoc = {
                    $set: {
                        isBooked: "booked",
                    },
                };
                const result = await allProductsCollection.updateOne(
                    filter,
                    updatedDoc,
                    option
                );
                res.send(result);
            }
        );

        app.get("/productsByBrand/:name", async (req, res) => {
            const name = req.params.name;
            const search = req.query.search
            let query = { category_name: name };
             
             if(search){
                 query = {
                    category_name: name,
                    $text:{
                        $search:search
                    }
                };
            }
            console.log(query);
            const update = await allProductsCollection.find(query).toArray();

            res.send(update);
        });
        // posting orders

        app.post("/orders", async (req, res) => {
            const order = req.body;
            const result = await ordersCollection.insertOne(order);

            res.send(result);
        });

        app.post("/create-payment-intent", async (req, res) => {
            const paymentData = req.body;
            // console.log(paymentData);
            const price = paymentData.resalePrice;
            const amount = price * 100;

            const paymentIntent = await stripe.paymentIntents.create({
                currency: "usd",
                amount: amount,
                payment_method_types: ["card"],
            });
            res.send({
                clientSecret: paymentIntent.client_secret,
            });
        });

        app.get("/jwt", async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);

            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN);
                return res.send({ accessToken: token });
            }
            console.log(user);
            res.status(403).send({ accessToken: " " });
        });

        app.get("/users-buyers", async (req, res) => {
            const query = { role: "buyer" };
            const users = await usersCollection.find(query).toArray();

            res.send(users);
        });

        app.get("/admin/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.isAdmin === "admin" });
        });

        app.get("/sellers/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ isSeller: user?.role === "seller" });
        });

        app.delete("/sellerProduct/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await allProductsCollection.deleteOne(query);
            res.send(result);
        });

        app.delete("/advertise/:id", async (req, res) => {
            const orderID = req.params.id;
            const query = { id: orderID };
            const result = await allAdvertiseCollection.deleteOne(query);
            console.log(orderID);
            res.send(result);
        });

        app.get("/buyers/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ isBuyer: user?.role === "buyer" });
        });

        app.get("/sellersVerified/:email", async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            res.send({ isSellerVerified: user?.isVerified === "verified" });
        });

        app.put(
            "/users-sellers/isVerified/:id",
            verifyJWT,
            async (req, res) => {
                const decodedEmail = req.decoded.email;
                const query = { email: decodedEmail };
                const user = await usersCollection.findOne(query);

                if (user?.isAdmin !== "admin") {
                    return res
                        .status(403)
                        .send({ message: "Forbidden Access" });
                }
                const id = req.params.id;
                const filter = { _id: ObjectId(id) };
                const option = { upsert: true };
                const updatedDoc = {
                    $set: {
                        isVerified: "verified",
                    },
                };
                const result = await usersCollection.updateOne(
                    filter,
                    updatedDoc,
                    option
                );
                res.send(result);
            }
        );

        app.get("/users-sellers", async (req, res) => {
            const query = { role: "seller" };
            const users = await usersCollection.find(query).toArray();

            res.send(users);
        });

        app.get("/users", async (req, res) => {
            reqEmail = req.query.email;
            console.log(reqEmail);
            const query = { email: reqEmail };
            const users = await usersCollection.find(query).toArray();

            res.send(users[0]);
        });

        app.post("/users", async (req, res) => {
            const user = req.body;
            // console.log(user)
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });

        app.delete("/users/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await usersCollection.deleteOne(query);
            res.send(result);
        });

        app.get("/orders", verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            // console.log(email)
            // console.log(decodedEmail)
            if (email !== decodedEmail) {
                return res
                    .status(403)
                    .send({ message: "forbidden bal access" });
            }
            const query = { email: email };
            const op = await ordersCollection.find(query).toArray();
            res.send(op);
        });

        app.get("/orders/:id", async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const op = await ordersCollection.findOne(query);
            res.send(op);
        });

        app.get("/myProducts", verifyJWT, async (req, res) => {
            const email = req.query.email;
            const decodedEmail = req.decoded.email;
            // console.log(email)
            // console.log(decodedEmail)
            if (email !== decodedEmail) {
                return res
                    .status(403)
                    .send({ message: "forbidden bal access" });
            }
            const query = { email: email };
            const op = await allProductsCollection.find(query).toArray();
            res.send(op);
        });

        app.put(
            "/advertise/:id",
            // verifyJWT,

            async (req, res) => {
                const id = req.params.id;
                const filter = { _id: ObjectId(id) };
                const option = { upsert: true };
                const product = req.body;
                const updatedDoc = {
                    $set: {
                        id: product._id,
                        email: product.email,
                        picture: product.picture,
                        model_name: product.model_name,
                        location: product.location,
                        resale_price: product.resale_price,
                        original_price: product.original_price,
                        years_of_use: product.years_of_use,
                        posted_time: product.posted_time,
                        seller_name: product.seller_name,
                        isVerified: product.isVerified,
                        isBooked: product.isBooked,
                        details: product.details,
                    },
                };
                const result = await allAdvertiseCollection.updateOne(
                    filter,
                    updatedDoc,
                    option
                );
                console.log(product);
                res.send(result);
            }
        );
    } finally {
    }
}

run().catch(console.log);

app.get("/", async (req, res) => {
    res.send("sellphone server is running");
});

app.listen(port, () => console.log(`sellphone server running on port:${port}`));
