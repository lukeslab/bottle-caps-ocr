require('dotenv').config();
const MongoClient = require('mongodb').MongoClient
const cluster = process.env.CLUSTER;

MongoClient.connect(cluster)
    .then(client => {
        console.log(`Connected to cluster.`);
        const db = client.db('build-my-own-api');
        const collection = db.collection('coke-caps');

        const bodyPraser = require('body-parser');
        const express = require('express');
        const app = express();
        const PORT = process.env.PORT || 3000;
        
        app.set('view engine', 'ejs');
        app.use(bodyPraser.urlencoded({extended: true}));

        app.post('/addCokeCaps', (req, res) => {
            checkRequiredParameters(req.body);            
            collection.insertOne(req.body)
                .then(result => {
                    console.log(result);
                    res.redirect('/');
                })
                .catch(err => console.error(err.message))
        })

        app.get('/', (req, res) => {
            collection.find().toArray().then(results => {
                res.render("index.ejs", {cokeCaps: results});
            })
        });

        app.post('/updateCokeCap', (req, res) => {
            checkRequiredParameters(req.body);
            console.log(req.body)
            collection.updateOne({code: req.body.code}, {$set: {status: req.body.status}})
                .then(result => {
                    console.log(result);
                    res.redirect('/');
                })
                .catch(err => console.error(err.message));
        });

        app.post('/deleteCokeCap', (req, res) => {
            if (!req.body.code) throw new Error('Code property not found');
            collection.deleteOne({code: req.body.code})
                .then(result => {
                    console.log(result);
                    res.redirect('/');
                })
                .catch(err => console.error(err.message));
        });
        
        app.listen(PORT);
        console.log(`Server is running on port ${PORT}`);
    })
    .catch(err => console.error(err.message))






function checkRequiredParameters(reqBody){
    if (!reqBody.code || !reqBody.status) throw new Error('Required parameters not found');
}