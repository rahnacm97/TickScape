const User = require('../../models/userSchema');
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const session = require('express-session');


function generateOtp(){
    const digits = "1234567890";
    let otp = "";
    for(let i = 0;i<6;i++){
        otp+=digits[Math.floor(Math.random()*10)];
    }
    return otp;
}

const sendVerificationEmail = async(email,otp) => {
    try {
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.NODEMAILER_EMAIL,
                pass:process.env.NODEMAILER_PASSWORD,
            }
        })

        const mailOptions = {
            from: process.env.NODEMAILER_EMAIL,
            to: email,
            subject: "Your OTP for Password reset",
            text:`OTP is ${otp}`,
            html: `<b><h4>Your OTP is ${otp}</h4><br></b>`
        }

        const info = await transporter.sendMail(mailOptions);

       const isUser =  await User.findOne({email})
       if(!isUser){
        return false
       }

   // Assign the OTP to the user object
isUser.otp = otp;

// Save the updated user object
await isUser.save();


        console.log("Email sent:",info.messageId);
        return true;
    } catch (error) {
        console.error("Error sending email",error);
        return false;
    }
}

const securePassword = async(password) => {
    try {
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash;
    } catch (error) {
        
    }
}

const getForgotPassword = async(req,res) => {
    try {
       res.render('forgot-password'); 
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const forgotEmailValid = async(req,res) => {
    try {
        const {email} = req.body;
        const findUser = await User.findOne({email:email});
        if(findUser){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.email = email;
                res.render('forgotPass-otp');
                console.log("OTP:",otp);
            }else{
                res.json({success:false,message:"Failed to send OTP. Please try again."});
            }
        }else{
            res.render('forgot-password',{
                message:"User with this email does not exist"
            });
        }

    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const verifyForgotPassOtp = async(req,res) => {
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            // res.render('reset-password');
            res.json({success:true,redirectUrl:'/reset-password'});
        }else{
            res.json({success:false,message:"OTP does not match"});
        }
    } catch (error) {
        res.status(500).json({success:false,message:"An error occured. Please try again"});
    }
}

const getResetPassword = async(req,res) => {
    try {
        res.render('reset-password');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const resendForgotOtp = async(req,res) => {
    try {
        const otp = generateOtp();
        req.session.userOtp = otp;
        const email = req.session.email;
        console.log("Resnding OTP to email:", email);
        const emailSent = await sendVerificationEmail(email,otp);
        if(emailSent){
            console.log("Resend OTP:",otp);
            res.status(200).json({success:true,message:"Resend OTP Successfull"});
        }
    } catch (error) {
        console.log("Error in resend OTP");
        res.status(500).json({success:false,message:"Internal Server Error"});
    }
}

const postNewPassword = async(req,res) => {
    try {
        const {newPass1,newPass2} = req.body;
        const email = req.session.email;
        if(newPass1 === newPass2){
            const passwordHash = await securePassword(newPass1);
            await User.updateOne(
                {email:email},
                {$set:{password:passwordHash}}
            )
            res.redirect('/login');
        }else{
            res.render("reset-password",{message:"Password do not match"});
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const userProfile = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        res.render('profile',{
            user:userData,
        })
    } catch (error) {
        console.error("Error retriving user profile",error);
        res.redirect('/pageNotFound');
    }
}

const changeEmail = async(req,res) => {
    try {
        res.render('change-email');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const changeEmailValid = async(req,res) => {
    try {
        const {email} = req.body;
        const userExists = await User.findOne({email});
        if(userExists){
            const otp = generateOtp();
            const emailSent = await sendVerificationEmail(email,otp);
            if(emailSent){
                req.session.userOtp = otp;
                req.session.userData = req.body;
                req.session.email = email;
                res.render("change-email-otp");
                console.log("Email Sent:",email);
                console.log("OTP:",otp);

            }else{
                res.json("email-error");
            }
        }else{
            res.render('change-email',{message:"User with this email does not exist"});
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const verifyEmailOtp = async(req,res) => {
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            res.render('new-email',{
                userData: req.session.userData,
            })
        }else{
            res.render('change-email-otp',{
                message: "OTP Not Match",
                userData: req.session.userData
            })
        }
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

module.exports = {
    getForgotPassword,
    forgotEmailValid,
    verifyForgotPassOtp,
    getResetPassword,
    resendForgotOtp,
    postNewPassword,
    userProfile,
    changeEmail,
    changeEmailValid,
    verifyEmailOtp,
}