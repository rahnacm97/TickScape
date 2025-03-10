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
const fs = require('fs');

db();

app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use((req, res, next) => {
    res.set("Cache-Control", "no-store");
    next();
  });

app.use(session({
    secret: process.env.SESSION_SECRET, 
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI, 
        collectionName: "sessions", 
        ttl: 72 * 60 * 60, 
    }),
    cookie: {
        secure: false,
        httpOnly: true,
        maxAge: 72 * 60 * 60 * 1000 
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

// 404 Handler for User Routes
app.use('/', (req, res, next) => {
    if (!req.path.startsWith('/admin')) { 
      res.status(404).render("404page", {
        message: "The page you are looking for does not exist."
      });
    } else {
      next(); 
    }
});
  
// 404 Handler for Admin Routes 
app.use('/admin', (req, res) => {
    res.status(404).render("admin-error", {
      message: "The requested admin page does not exist."
    });
});

// Global Error Handling Middleware
// app.use((err, req, res, next) => {
//     const statusCode = err.statusCode || 500;
//     const message = err.message || "Something went wrong! Please try again later.";
//     res.status(statusCode).json({ error: message });
// });

app.use((err, req, res, next) => {
    const statusCode = err instanceof CustomError ? err.statusCode : 500;
    const message = err.message || "Something went wrong! Please try again later.";

    console.error(`[${new Date().toISOString()}] ${statusCode} - ${message}`, err.stack);

    if (req.accepts('json')) {
        res.status(statusCode).json({
            status: 'error',
            statusCode,
            message
        });
    } else {
        const errorUrl = req.path.startsWith('/admin') 
            ? `/admin/pageerror?status=${statusCode}&message=${encodeURIComponent(message)}`
            : `/pageNotFound?status=${statusCode}&message=${encodeURIComponent(message)}`;
        res.redirect(errorUrl);
    }
});

const port = process.env.PORT;
app.listen(port, () => {
    console.log(`Server running http://localhost:${port}`);
});

module.exports = app;