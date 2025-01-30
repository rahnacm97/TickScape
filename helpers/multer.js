const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({ 
    destination: function (req, file, cb) { 
        cb(null, 'public/uploads/product-images/'); 
        //cb(null, 'public/uploads/re-image/');
    }, 
    filename: function (req, file, cb) { 
        console.log(file,'000000');
        cb(null, Date.now() + path.extname(file.originalname)); 
    } 
});

module.exports = storage;