const express = require('express');
const router = express.Router();
const passport = require('passport');
const userController = require('../controllers/user/userController');

router.get('/pageNotFound',userController.pageNotFound);
router.get('/',userController.loadHomePage);
router.get('/login',userController.loadLoginPage);
router.post('/login',userController.login);
router.get('/logout',userController.logout);
router.get('/signup',userController.loadSignupPage);
router.post('/signup',userController.signup);
router.post('/verify-otp',userController.verifyOtp);
router.post('/resend-otp',userController.resendOtp);

router.get('/auth/google',passport.authenticate('google',{scope:['profile','email']}));
router.get('/auth/google/callback',passport.authenticate('google',{failureRedirect:'/signup'}),(req,res) => {
    res.locals.user = req.user;
    res.redirect('/');
});


module.exports = router;