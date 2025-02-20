const express = require('express');
const app = express();
require('dotenv').config();
const passport = require('./config/passport');
const path = require('path');
const session = require('express-session');
const db = require('./config/db');
const userRouter = require('./routes/userRouter');
const adminRouter = require('./routes/adminRouter');
const CustomError = require("./utils/customError");
const MongoStore = require("connect-mongo");

db();

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });
app.use(session({
    secret: process.env.SESSION_SECRET, // Store in .env for security
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI, // MongoDB connection string
        collectionName: "sessions", // Name of the collection in MongoDB
        ttl: 72 * 60 * 60, // Session expiration time in seconds (72 hours)
    }),
    cookie: {
        secure: false, // Set to true in production with HTTPS
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000 // 72 hours
    }
}))

app.use(passport.initialize());
app.use(passport.session());
app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    next();
});

app.set('view engine','ejs');
app.set('views',[path.join(__dirname,'views/users'),path.join(__dirname,'views/admin')]);
app.use(express.static(path.join(__dirname,'public')));
app.use('/viewOrder/assets', express.static(path.join(__dirname, 'public/assets')));
app.use('/viewOrder/user-assets', express.static(path.join(__dirname, 'public/user-assets')));


app.use('/',userRouter);
app.use('/admin',adminRouter);


// Global Error Handling Middleware
app.use((err, req, res, next) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || "Something went wrong! Please try again later.";
    res.status(statusCode).json({ error: message });
});



const port = process.env.PORT;
app.listen(port, () => {
    console.log(`Server running http://localhost:${port}`);
});

module.exports = app;