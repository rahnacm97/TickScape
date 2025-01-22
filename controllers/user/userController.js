const User = require('../../models/userSchema');
const Category = require('../../models/categorySchema');
const Product = require('../../models/productSchema');
const Banner = require('../../models/bannerSchema');
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');

const pageNotFound = async(req,res) => {
    try{
        await res.render("404page");
    }catch(err){
        res.redirect('/pageNotFound');
    }
}

const loadHomePage = async(req,res) => {
    try{
        const today = new Date().toISOString();
        const findBanner = await Banner.find({
            startDate:{$lt:new Date(today)},
            endDate:{$gt:new Date(today)},
        });
        const user = req.session.user;
        const categories = await Category.find({isListed:true});
        let productData = await Product.find({
            isBlocked:false,
            category:{$in:categories.map(category=>category._id)},quantity:{$gt:0}
        })

        productData.sort((a,b) => new Date(b.createdOn) - new Date(a.createdOn));
        productData = productData.slice(0,4);
        if(user){
            const userData = await User.findOne({_id:user._id});
            res.locals.user = userData;
            res.render("home",{user:userData,products:productData,banner:findBanner || []});
        }else{
            res.locals.user = null;
            return res.render("home",{products:productData, banner:findBanner || []});
        }
       
    }catch(err){
        console.log("Home Page Not Found");
        res.status(500).send("Server Error");
    }
}

const loadLoginPage = async(req,res) => {
    try{
       
            return res.render('login');
    }catch(err){
        res.redirect('/pageNotFound');
    }
}

const login = async(req,res) => {
    try{
        const {email,password} = req.body;
        const findUser = await User.findOne({isAdmin: 0,email:email});
        if(!findUser){
            return res.render("login",{message:"User Not Found"});
        }
        if(findUser.isBlocked){
            return res.render("login",{message:"User is Blocked by Admin"});
        }
        const passwordMatch = await bcrypt.compare(password,findUser.password);
        if(!passwordMatch){
            return res.render("login",{message:"Incorrect Password"});
        }
        req.session.user = findUser;
        res.redirect('/');
    }catch(err){
        console.error("Login error",err);
        res.render("login",{message:"Login Failed. Please try again."})
    }
}


function generateOtp(){
    return Math.floor(100000 + Math.random()*900000).toString();
}

async function sentVerification(email,otp){
    try{
        const transporter = nodemailer.createTransport({
            service: 'gmail',
            port: 587,
            secure: false,
            requireTLS: true,
            auth:{
                user: process.env.NODEMAILER_EMAIL,
                pass: process.env.NODEMAILER_PASSWORD
            }
        })

        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Verify Your Account",
            text: `Your OTP is ${otp}`,
            html:`<b>Your OTP is to verify the TickScape account is ${otp}</b>`,

        })

        return info.accepted.length > 0
    }catch(error){
        console.error("Error sending Email",error);
        return false;
    }
}

const loadSignupPage = async(req,res) => {
    try{
        await res.render("signup");
    }catch(err){
        console.log("Sign Up Page Not Found");
        res.status(500).send("Server Error");
    }
}

const signup = async(req,res) => {
    try{
        const {fname,lname,phone,email, password,cpassword} = req.body;
        if(password !== cpassword){
            return res.render('signup',{message:"Password do not match"});
        }
        const findUser = await User.findOne({email});
        if(findUser){
            return res.render('signup',{message:"Email already exists"});
        }

        const otp = generateOtp();

        const emailSent = await sentVerification(email,otp);

        if(!emailSent){
            return res.json("email-error");
        }

        req.session.userOtp = otp;
        req.session.userData = {fname,lname,phone,email,password};

        res.render("verify-otp");
        console.log("OTP Sent ",otp);

    }catch(err){
        console.error("Signup Error",err);
        res.redirect('/pageNotFound');
    }
}

const securePassword = async (password) => {
    try{
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash;
    }catch(error){
        console.error("Error hashing password:", error);
        throw new Error("Password hashing failed");
    }
}

const verifyOtp = async (req,res) => {
    try{
        const {otp} = req.body;
        console.log(otp);

        if(otp === req.session.userOtp){
            const user = req.session.userData;
            const passwordHash = await securePassword(user.password);
            const saveUserData = new User({
                fname:user.fname,
                lname:user.lname,
                email:user.email,
                phone:user.phone,
                password:passwordHash,
                isAdmin:0,
            })
            await saveUserData.save();
            req.session.user = saveUserData._id;
            res.json({success:true,redirectUrl:"/login"});
        }else{
            res.status(400).json({success:false, message:"Invalid OTP, Please try again"});
        }
    }catch(error){
        console.error("error verifying OTP",error);
        res.status(500).json({success:false, message:"An error occured"});
    }
}

const resendOtp = async (req,res) =>{
    try{
        const {email} = req.session.userData;
        if(!email){
            return res.status(400).json({success:false,message:"Email not found in session"});
        }
        const otp = generateOtp();
        req.session.userOtp = otp;

        const emailSent = await sentVerification(email,otp);
        if(emailSent){
            console.log("Resend OTP",otp);
            res.status(200).json({success:true,message:"OTP Resend Successfully"});
        }else{
            res.status(500).json({success:false,message:"Failed to resend OTP. Please try again"});
        }
    }catch(error){
        console.error("Error resending OTP",error);
        res.status(500).json({success:false,message:"Internal Server Error. Please try again"});
    }
}



const logout = async (req,res) => {
    try{
        req.session.destroy((err) => {
            if(err){
                console.log("Session destruction error",err.message);
                return res.redirect('/pageNotFound');
            }
            return res.redirect('/login');
        })

    }catch(error){
        console.log("Logout Error",error);
        res.redirect('/pageNotFound');
    }
}


module.exports = {
    loadHomePage,
    pageNotFound,
    loadLoginPage,
    login,
    loadSignupPage,
    signup,
    verifyOtp,
    resendOtp,
    logout,
}