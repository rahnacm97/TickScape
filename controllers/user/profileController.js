const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
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
        //console.log("User ID:", userId);
        const userData = await User.findById(userId);
        const addressData = await Address.findOne({userId:userId});
        const orders = await Order.find({ userId: userId }).populate('productId').exec();

        console.log("Fetched Orders:", orders);

        res.render('profile',{
            user:userData,
            userAddress:addressData,
            orders,
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

const updateEmail = async(req,res) => {
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId,{email:newEmail});
        res.redirect('/userProfile');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const changePassword = async(req,res) =>{
    try {
        res.render('change-password');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const changePasswordValid = async(req,res) => {
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
                res.render("change-password-otp");
                console.log("Email Sent:",email);
                console.log("OTP:",otp);
            }else{
                res.json({
                    success:false,
                    message:"Failed to send OTP. Please try again."
                });
            }
        }else{
            res.render('change-password',{message:"User with this email does not exist"});
        }
    } catch (error) {
        console.log("Error in change password");
        res.redirect("/pageNotFound");
    }
}

const verifyChangePassOtp = async(req,res) => {
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            // res.render('reset-password');
            res.json({success:true,redirectUrl:'/reset-password'});
        }else{
            res.json({success:false,message:"OTP does not match"});
        }
    } catch (error) {
        res.status(500).json({success:false,message:"An error occured. Please try again later."});
    }
}

const addAddress = async(req,res) => {
    try {
        const user = req.session.user;
        res.render('add-address',{user:user});
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

const userAddAddress = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findOne({_id:userId});
        const {addressType,name,city,landMark,state,pincode,phone,altPhone} = req.body;

        const userAddress = await Address.findOne({userId:userData._id});
        if(!userAddress){
            const newAddress = new Address({
                userId : userData._id,
                address: [{addressType,name,city,landMark,state,pincode,phone,altPhone}]

            });
            await newAddress.save();
        }else{
            userAddress.address.push({addressType,name,city,landMark,state,pincode,phone,altPhone})
            await userAddress.save();
        }
        res.redirect('/userProfile');
    } catch (error) {
        console.error("Error adding address",error);
        res.redirect('/pageNotFound');
    }
}

const editAddress = async(req,res) => {
    try {
        const addressId = req.query.id;
        const user = req.session.user;
        const currAddress = await Address.findOne({
            "address._id" : addressId,
        });

        if(!currAddress){
            return res.redirect('/pageNotFound');
        }

        const addressData = currAddress.address.find((item) => {
            return item._id.toString() === addressId.toString();
        })

        if(!addressData){
            return res.redirect('/pageNotFound');
        }

        res.render('edit-address',{address:addressData,user:user});
    } catch (error) {
        console.error("Error in editing address",error);
        res.redirect('/pageNotFound');
    }
}

const userEditAddress = async(req,res) =>{
    try {
        const data = req.body;
        const addressId = req.query.id;
        const user = req.session.user;
        const findAddress = await Address.findOne({"address._id":addressId});
        if(!findAddress){
            res.redirect('/pageNotFound');
        }
        await Address.updateOne(
            {"address._id":addressId},
            {$set:{
                "address.$":{
                    _id: addressId,
                    addressType: data.addressType,
                    name: data.name,
                    city: data.city,
                    landMark: data.landMark,
                    state: data.state,
                    pincode: data.pincode,
                    phone: data.phone,
                    altPhone: data.altPhone
                }
            }}
        )
        res.redirect('/userProfile');
    } catch (error) {
        console.error("Error in editing address",error);
        res.redirect('/pageNotFound');
    }
}

const deleteAddress = async(req,res) => {
    try {
        const addressId = req.query.id;
        const findAddress = await Address.findOne({"address._id":addressId});
        if(!findAddress){
            return res.status(404).send("Address Not Found");
        }

        await Address.updateOne({
            "address._id":addressId
        },
        {
            $pull : {
                address: {
                    _id: addressId,
                }
            }
        }
    )

    res.redirect('/userProfile');
    } catch (error) {
        console.error("Error in deleting address",error);
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
    updateEmail,
    changePassword,
    changePasswordValid,
    verifyChangePassOtp,
    addAddress,
    userAddAddress,
    editAddress,
    userEditAddress,
    deleteAddress,
}