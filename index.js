const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


// mongoDB connections
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.mpr3cem.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        const appoinmentOptionsCollection = client.db("doctorsPortal").collection("appoinmentOptions");
        const bookingsCollection = client.db("doctorsPortal").collection("bookings");

        // Use aggregate to query multiple collection and then merge data
        // get all inseted data MongoDb!
        app.get('/appoinmentOptions', async (req, res) => {
            const date = req.query.date;
            console.log(date);
            const query = {};
            const options = await appoinmentOptionsCollection.find(query).toArray();

            // code carefully :D
            const bookingQuery = { appoinmentDate: date }
            const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();
            options.forEach(option => {
                const optionBooked = alreadyBooked.filter(book => book.treatment === option.name);
                const bookedSlots = optionBooked.map(book => book.slot)
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
                        slots: {
                            $setDifference: ['$slots', '$booked']
                        }
                    }
                }
            ]).toArray();
            res.send(options);
        })


        // git commit -m"API naming convention and save Booking to MongoDB database"
        // booikg post
        app.post('/bookings', async (req, res) => {
            const booking = req.body;
            console.log(booking);
            const result = await bookingsCollection.insertOne(booking);
            res.send(result);
        })
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