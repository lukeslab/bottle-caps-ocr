require('dotenv').config();
const cluster = process.env.CLUSTER;

const MongoClient = require('mongodb').MongoClient

MongoClient.connect(cluster)
    .then(client => {
        console.log(`Connected to cluster.`);
        
        //Environment Variables
        const PORT = process.env.PORT || 3000;

        //Nativeware
        const fs = require('fs');
        const path = require('path');
        const formData = require('form-data');

        //Middleware
        const db = client.db('bottle-caps');
        const collections = {
            "coke-caps" : db.collection('coke-caps'),
            "ocr_models" : db.collection('ocr_models'),
            "training-images" : db.collection('training-images')
        }

        const axios = require('axios').default;
        axios.defaults.baseURL = "https://app.nanonets.com/api/v2/OCR/Model/";
        axios.defaults.headers.common['Authorization'] = `Basic ${Buffer.from(process.env.NANONETS_API+':').toString('base64')}`
        axios.defaults.headers.post['Content-Type'] = 'application/json';

        const multer = require('multer');
        const uploadTrainingImages = multer({
            dest: path.join(__dirname, "public/images/training")
        });

        const express = require('express');
        const app = express();    

        //App
        app.set('views', './public/views')
        app.set('view engine', 'ejs');

        app.use(express.static('public'));
        app.use(express.urlencoded({extended: true}));

        app.get('/', async (req, res) => {
            const ocr_models = await collections.ocr_models
                .find({})
                .toArray()
                .then( result => result)
                .catch(err => console.error(err));

            res.render('index.ejs', {ocr_models});
            // This should return model ID's from a db and their status: trained / not trained.
        }) 

        app.post('/uploadImages',
            uploadTrainingImages.array('imageFile'), 
            async (req, res) => {
                // If model ID given in response, apply files to that Id. Else, create new ID, save to db.
                const images = req.files;
                console.log(req.body)
                try{

                    //if(!images) throw new Error('No image files uploaded.')
                
                    const modelID = req.body.modelID;
                    const modelIDisValid = await checkModelIDisValid(modelID);
                    if (!modelIDisValid) {

                        const modelID = await createNewModelID();
                        await saveModelIDToDatabase(modelID);

                    }

                } catch (e){

                    console.error(e)

                }
                // uploadImagesToModelID(images, modelID);

                res.redirect('/');
                // let errorMsg = ''
                // console.log(req.files[0].filename)
                // if (!req.body.modelID) errorMsg += 'No Model ID specified. ';
                // if (!req.files) errorMsg += 'No image file selected.';
                // if (!req.files || !req.body.modelID) throw new Error(errorMsg)
                
                // // Upload the image to the server.
                // req.files.forEach( async file =>{

                //     const fileExt = path.extname(file.originalname);
                //     const oldPath = file.path;
                //     const newPath = `${oldPath}${fileExt}`;

                //     fs.rename(oldPath, newPath, err => {
                //         if (err) throw err
                //         console.log(file)

                //         const fileStream = fs.createReadStream(`./images/training/${file.filename}${fileExt}`);
                        
                //         const form = new formData();
                //         form.append('file', fileStream, `${file.filename}${fileExt}`)
                //         form.append('data', JSON.stringify(
                //             [
                //                 {
                //                     filename: `${file.filename}${fileExt}`,
                //                     object: [
                //                         {
                //                             name:'cap-code',
                //                             ocr_text: '4XLK9HM PRMH66K', 
                //                             bndbox: {
                //                                 xmin: 1354,
                //                                 ymin: 1307,
                //                                 xmax: 2295,
                //                                 ymax: 1748
                //                             }
                //                         }
                //                     ]
                //                 }
                //             ]
                //         ))
                //         console.log(form)
                //         // Upload image to nanonets model.
                //         axios.post(
                //             `${axios.defaults.baseURL}${req.body.modelID}/UploadFile/`, 
                //             form
                //         )
                //         .then(response => console.log(response))
                //         .catch(err => console.error(err))  
                //     })     
                // })   
            }
        )
        
        app.post('/deleteModel/:modelID', (req, res) => {
            const modelID = req.params.modelID;
            console.log(modelID)

            collections
                .ocr_models
                .deleteOne({"modelID": modelID})
                .then(response => res.redirect('/'))
                .catch(error => console.log(error))
                
        })

        app.post('/trainModelByID', (req, res) => {
            axios.post(`${axios.defaults.baseURL}${req.body.modelID}/Train/`)
            .then(response => {
                response.redirect('/');
                console.log(response);
            })
            .catch(err => console.error(err.response.data.errors));
        })
        
        const uploadPredictionFile = multer({
            dest: `${__dirname}/public/images/prediction`
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

        
        async function checkModelIDisValid(modelID){
            // check if the variable is empty
            // check if the model id exists
        
            if (!modelID) {
                return false;
            }
        
            const modelAlreadyExists = async () => {
                
                const find = await collections
                    .ocr_models
                    .findOne({"modelID": modelID})
                    .then( result => result ? true : false)
                    .catch( err => console.log(err) )

                // console.log(modelID)
                // console.log(find)

            };

            return modelAlreadyExists(modelID) ? true : false
            
        }

        async function createNewModelID(){

            return await axios.post(`${axios.defaults.baseURL}`, {

                categories: ["code"],
                model_type: "ocr"

            })
            .then(result => result.data.model_id)
            .catch(error => {
                error = JSON.stringify(error.response.data.errors)
                throw new Error(error)
            })

        }

        function saveModelIDToDatabase(modelID){

            collections
                .ocr_models
                .insertOne({"modelID": modelID, "isTrained":false})

        }

        function uploadImagesToModelID(){}
   
        function checkRequiredParameters(reqBody){
            if (!reqBody.code || !reqBody.status) throw new Error('Required parameters not found');
        }
    })
    .catch(err => console.error(err))
