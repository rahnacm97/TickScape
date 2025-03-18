const mongoose = require('mongoose');
const env = require('dotenv').config();

const connectDB = async() => {
    try{
       const conn = await mongoose.connect(process.env.MONGODB_URI);
        console.log("DB Connected");
        console.log('connection name',conn.connection.name)
    }catch(err){
        console.log("DB Connection error",err.message);
        process.exit(1);
    }
}

module.exports = connectDB;