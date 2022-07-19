require('dotenv').config();
const cluster = process.env.CLUSTER;

const MongoClient = require('mongodb').MongoClient

MongoClient.connect(cluster)
    .then(client => {
        const PORT = process.env.PORT || 3000;
        console.log(`Connected to cluster.`);

        const db = client.db('build-my-own-api');
        const collection = db.collection('coke-caps');

        const axios = require('axios').default;
        axios.defaults.baseURL = "https://app.nanonets.com/api/v2/OCR/Model/";
        axios.defaults.headers.common['Authorization'] = `Basic ${Buffer.from(process.env.NANONETS_API+':').toString('base64')}`
        axios.defaults.headers.post['Content-Type'] = 'application/json';

        const express = require('express');
        const app = express();
        
        app.set('views', './public/views')
        app.set('view engine', 'ejs');

        app.use(express.static('public'));
        app.use(express.urlencoded({extended: true}));

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
                res.render("index.ejs", {
                    cokeCaps: results,
                    files: null
                });
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

        //Nanonets api testing interface     
        app.post('/createNewModel', (req, res) => {
            if (!req.body.categories) throw new Error('Categories not specified');
            console.log(req.body.categories.split(","));

            axios.post(`${axios.defaults.baseURL}`, {
                "categories": req.body.categories.split(","),
                "model_type": "ocr"
            })
            .then(response => {
                response.redirect('/');
                console.log(response);
            })
            .catch(err => console.error(err))

        })

        const fs = require('fs');
        const path = require('path');
        const formData = require('form-data');
        const multer = require('multer');
        const uploadTrainingImages = multer({
            dest: path.join(__dirname, "/images/training")
        });
        
        app.post('/uploadImage',
            uploadTrainingImages.array('imageFile'), 
            (req, res) => {
                // Verify all nanonets api components are present.
                let errorMsg = ''
                console.log(req.files[0].filename)
                if (!req.body.modelID) errorMsg += 'No Model ID specified. ';
                if (!req.files) errorMsg += 'No image file selected.';
                if (!req.files || !req.body.modelID) throw new Error(errorMsg)
                
                // Upload the image to the server.
                req.files.forEach( async file =>{

                    const fileExt = path.extname(file.originalname);
                    const oldPath = file.path;
                    const newPath = `${oldPath}${fileExt}`;

                    fs.rename(oldPath, newPath, err => {
                        if (err) throw err
                        console.log(file)

                        const fileStream = fs.createReadStream(`./images/training/${file.filename}${fileExt}`);
                        
                        const form = new formData();
                        form.append('file', fileStream, `${file.filename}${fileExt}`)
                        form.append('data', JSON.stringify(
                            [
                                {
                                    filename: `${file.filename}${fileExt}`,
                                    object: [
                                        {
                                            name:'cap-code',
                                            ocr_text: '4XLK9HM PRMH66K', 
                                            bndbox: {
                                                xmin: 1354,
                                                ymin: 1307,
                                                xmax: 2295,
                                                ymax: 1748
                                            }
                                        }
                                    ]
                                }
                            ]
                        ))
                        console.log(form)
                        // Upload image to nanonets model.
                        axios.post(
                            `${axios.defaults.baseURL}${req.body.modelID}/UploadFile/`, 
                            form
                        )
                        .then(response => console.log(response))
                        .catch(err => console.error(err))  
                    })     
                })   
            }
        )
        
        app.post('/trainModelByID', (req, res) => {
            axios.post(`${axios.defaults.baseURL}${req.body.modelID}/Train/`)
            .then(response => {
                response.redirect('/');
                console.log(response);
            })
            .catch(err => console.error(err.response.data.errors));
        })
        
        const uploadPredictionFile = multer({
            dest: `${__dirname}/images/prediction`
        })
        app.post(
            '/uploadPredictionImage', 
            uploadPredictionFile.single('predictionImage'),
            (req, res) => {
                let errorMsg = ''
                if (!req.body.modelID) errorMsg += 'No Model ID specified. ';
                if (!req.file) errorMsg += 'No image file selected.';
                if (!req.file || !req.body.modelID) throw new Error(errorMsg)

                const fileExt = path.extname(req.file.originalname);
                const oldPath = req.file.path;
                const newPath = `${oldPath}${fileExt}`;
                console.log(req.file.filename)
                fs.rename(oldPath, newPath, err => {
                    if (err) throw new Error(err)
                    
                    axios.post( 
                        `${ axios.defaults.baseURL }${ req.body.modelID }/LabelFile/?async=false`, 
                        { 
                            modelId: `${req.body.modelID}`,
                            file: fs.createReadStream( `images/prediction/${ req.file.filename }${ fileExt }`)
                        }
                    )
                    .then(response => {
                        response.redirect('/');
                        console.log(response);
                    })
                    .catch(err => console.error(err.response, err.response.data.errors))        
                })
            }
        )

        app.get(
            `/getAllPredictionFiles`, 
            (req, res) => {
                // console.log(req)
                let msg = '';
                if (!req.query.modelID) msg += 'No model ID.'
                if (!req.query['start_day']) msg += ' No start day.';
                if (!req.query['end_day']) msg += ' No end day';

                const start_day = new Date(req.query['start_day']);
                const current_batch_day = new Date(req.query['end_day']);

                axios.get(`https://app.nanonets.com/api/v2/Inferences/Model/${req.query.modelID}/ImageLevelInferences?start_day_interval=${start_day.getTime()}current_batch_day=${current_batch_day.getTime()}`)
                    .then(response => console.log(response.data['moderated_images']))
                    .catch(error => console.error(error.response.data.errors))
                
            }
        )


        app.listen(PORT);
        console.log(`Server is running on port ${PORT}`);

    })
    .catch(err => console.error(err))


  
function checkRequiredParameters(reqBody){
    if (!reqBody.code || !reqBody.status) throw new Error('Required parameters not found');
}