const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


// mongoDB connections
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.mpr3cem.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// after check jwt localStorage Then decleare this function
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send('unauthorized access');
    }
    const token = authHeader.split(' ')[1];

    jwt.verify(token, process.env.ACCESS_TOKEN, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'forbidden access' })
        }
        req.decoded = decoded;
        next();
    });

}

async function run() {
    try {
        const appoinmentOptionsCollection = client.db("doctorsPortal").collection("appoinmentOptions");
        const bookingsCollection = client.db("doctorsPortal").collection("bookings");
        const usersCollection = client.db("doctorsPortal").collection("users");
        const doctorsCollection = client.db("doctorsPortal").collection("doctors");

        // NOTE: Make sure u use verifyAdmin after verifyJWT
        const verifyAdmin = async (req, res, next) => {
            // console.log('inside verifyAdmin', req.decoded.email);
            const decodedEmail = req.decoded.email;
            const query = { email: decodedEmail };
            const user = await usersCollection.findOne(query);
            if (user?.role !== 'admin') {
                return res.status(403).send({ message: 'forbidden accesss' })
            }
            next();
        }

        // Use aggregate to query multiple collection and then merge data
        // get all inseted data MongoDb!
        app.get('/appoinmentOptions', async (req, res) => {
            const date = req.query.date;
            console.log(date);
            const query = {};
            const options = await appoinmentOptionsCollection.find(query).toArray();

            // code carefully :D
            const bookingQuery = { appoinmentDate: date };
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot);
                const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot))
                option.slots = remainingSlots;
                // console.log(date, option.name, remainingSlots.length);
            });
            res.send(options);
        });

        // Using mongodb aggregate project pipeline
        app.get('/v2/appoinmentOptions', async (req, res) => {
            const date = req.query.date;
            const options = await appoinmentOptionsCollection.aggregate([
                {
                    $lookup: {
                        from: 'bookings',
                        localField: 'name',
                        foreignField: 'treatment',
                        pipeline: [
                            {
                                $match: {
                                    $expr: {
                                        $eq: ['$appoinmentDate', date]
                                    }
                                }
                            }
                        ],
                        as: 'booked'
                    }
                },
                {
                    $project: {
                        name: 1,
                        price: 1,
                        slots: 1,
                        booked: {
                            $map: {
                                input: '$booked',
                                as: 'book',
                                in: '$$book.slot'
                            }
                        }
                    }
                },
                {
                    $project: {
                        name: 1,
                        price: 1,
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options);
        });

        // Add Doctor get
        app.get('/appointmentSpecialty', async (req, res) => {
            const query = {};
            const result = await appoinmentOptionsCollection.find(query).project({ name: 1 }).toArray();
            res.send(result);
        });

        // using for Dashboard tabel
        app.get('/bookings', verifyJWT, async (req, res) => {
            const email = req.query.email;
            // console.log('token inside VerifyJWT', req.headers.authorization);
            const decodedEmail = req.decoded.email;
            if (email !== decodedEmail) {
                return res.status(403).send({ message: 'forbidden access' });
            }

            const query = { email: email };
            const bookings = await bookingsCollection.find(query).toArray();
            res.send(bookings);
        });

        // using jwt Token
        app.get('/jwt', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const user = await usersCollection.findOne(query);
            if (user) {
                const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, { expiresIn: '1h' })
                return res.send({ accessToken: token });
            }
            console.log(user);
            res.status(403).send({ accessToken: '' });
        });


        // API naming convention and save Booking to MongoDB database
        // booikg post
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            console.log(booking);
            const query = {
                appoinmentDate: booking.appoinmentDate,
                email: booking.email, // same email diye 1tar beshi service same date same dt nite parbe na
                treatment: booking.treatment // onnodate nite parbo
            }
            const alreadyBooked = await bookingsCollection.find(query).toArray();

            if (alreadyBooked.length) {
                const message = `You already have a booking on ${booking.appoinmentDate}`;
                return res.send({ acknowledged: false, message });
            }

            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        });

        // get all user
        app.get('/users', async (req, res) => {
            const query = {};
            const users = await usersCollection.find(query).toArray();
            res.send(users);
        });

        // check admin or not Then access
        app.get('/users/admin/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email }
            const user = await usersCollection.findOne(query);
            res.send({ isAdmin: user?.role == 'admin' });
        });

        // using for dashboard users And Save registered user information in the database
        app.post('/users', async (req, res) => {
            const user = req.body;
            console.log(user);
            const result = await usersCollection.insertOne(user);
            res.send(result);
        });


        //  Update set users admin role in update user
        app.put('/users/admin/:id', verifyJWT, verifyAdmin, async (req, res) => {
            /* verifyAdmin func niye jawr por upore call kore, ei code comment korsi */
            // const decodedEmail = req.decoded.email;
            // const query = { email: decodedEmail };
            // const user = await usersCollection.findOne(query);
            // if (user?.role !== 'admin') {
            //     return res.status(403).send({ message: 'forbidden accesss' })
            // }

            const id = req.params.id;
            const filter = { _id: ObjectId(id) }
            const options = { upsert: true };
            const updateDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await usersCollection.updateOne(filter, updateDoc, options)
            res.send(result);
        });

        // ADD NEW PROPERTY IN Database Collection Only(server theke): Temporary to update price field on appoinment options
        // app.get('/addPrice', async (req, res) => {
        //     const filter = {};
        //     const options = { upsert: true }
        //     const updateDoc = {
        //         $set: {
        //             price: 99
        //         }
        //     }
        //     const result = await appoinmentOptionsCollection.updateMany(filter, updateDoc, options);
        //     res.send(result);
        // });

        // insert new doctors in form And client side sudu doctor name object toiri korlm ar ekhne api banalam, Tarpor abr clinet side url diye server hit korlm kaj sesh
        app.post('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorsCollection.insertOne(doctor);
            res.send(result);
        });

        // ekhon ami add kora data databse theke server pabo Then client side dekhbo
        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const query = {};
            const doctors = await doctorsCollection.find(query).toArray();
            res.send(doctors);
        });

        // Delete doctors // verify JWT add korsi seshe // erpor verifyAdmin
        app.delete('/doctors/:id', verifyJWT, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const result = await doctorsCollection.deleteOne(query);
            res.send(result);
        });

    }
    finally {

    }
}
run().catch(console.log);


// Initial and Basic Setup
app.get('/', (req, res) => {
    res.send('Doctors Portal is running...');
});

app.listen(port, () => {
    console.log(`Doctors portal is running: ${port}`);
});