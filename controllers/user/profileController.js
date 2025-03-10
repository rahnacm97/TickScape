const User = require('../../models/userSchema');
const Address = require('../../models/addressSchema');
const Order = require('../../models/orderSchema');
const CustomError = require('../../utils/customError');
const env = require('dotenv').config();
const nodemailer = require('nodemailer');
const bcrypt = require('bcrypt');
const session = require('express-session');
const crypto = require('crypto');
const Razorpay = require("razorpay");
const fs = require("fs");
const path = require("path");

//Otp generation
function generateOtp(){
    const digits = "1234567890";
    let otp = "";
    for(let i = 0;i<6;i++){
        otp+=digits[Math.floor(Math.random()*10)];
    }
    return otp;
}

//Otp to email
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

//hashing password
const securePassword = async(password) => {
    try {
        const passwordHash = await bcrypt.hash(password,10);
        return passwordHash;
    } catch (error) {
        
    }
}

//Forgot password
const getForgotPassword = async(req,res) => {
    try {
       res.render('forgot-password'); 
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

//Email validation
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

                setTimeout(()=>{
                    delete req.session.userOtp
                    req.session.save((err)=>{
                        if(err){
                            console.log('Error deleting session');
                        }
                    })
                    console.log('otp expired');
                  },60000)
                  console.log('5');

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

//Forgot password otp
const verifyForgotPassOtp = async(req,res) => {
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            // res.render('reset-password');
            req.session.user = req.session.user || {};
            res.json({success:true,redirectUrl:'/reset-password',user: req.session.user});
        }else{
            res.json({success:false,message:"OTP does not match"});
        }
    } catch (error) {
        res.status(500).json({success:false,message:"An error occured. Please try again"});
    }
}

//Reset password
const getResetPassword = async(req,res) => {
    try {
        res.render('reset-password');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

//Resend otp
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

//New password
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

//User profile loading
const userProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        const addressData = await Address.findOne({ userId: userId });

        const sortedWallet = userData.wallet.sort((a, b) => {
            return new Date(b.date) - new Date(a.date); // Descending order
          });

        // Pagination logic
        const page = parseInt(req.query.page) || 1;
        const limit = 5; 
        const skip = (page - 1) * limit;

        const totalEntries = sortedWallet.length;
        const paginatedWallet = sortedWallet.slice(skip, skip + limit);

        res.render('profile', {
            user: userData,
            userAddress: addressData,
            walletHistory: paginatedWallet,
            currentPage: page,
            totalPages: Math.ceil(totalEntries / limit),
        });

    } catch (error) {
        console.error("Error retrieving user profile", error);
        res.redirect('/pageNotFound');
    }
};



//Email changing
const changeEmail = async(req,res) => {
    try {
        const userId = req.session.user;
        const user = await User.findById({_id:userId});
        res.render('change-email',{
            user: user,
        }
        );
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

//Email change otp
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

                setTimeout(()=>{
                    delete req.session.userOtp
                    req.session.save((err)=>{
                        if(err){
                            console.log('Error deleting session');
                        }
                    })
                    console.log('otp expired');
                  },60000)
                  //console.log('5');

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

//Verify email otp
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

//Email otp
const updateEmail = async(req,res) => {
    try {
        const newEmail = req.body.newEmail;
        const userId = req.session.user;
        const user = await User.findByIdAndUpdate(userId,{email:newEmail});
        return res.redirect('/userProfile');
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

//Password change
const changePassword = async(req,res) =>{
    try {
        const userId = req.session.user;
        const user = await User.findById({_id:userId});
        res.render('change-password',{
            user: user,
        });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

//Password change otp
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

                setTimeout(()=>{
                    delete req.session.userOtp
                    req.session.save((err)=>{
                        if(err){
                            console.log('Error deleting session');
                        }
                    })
                    console.log('otp expired');
                  },60000)
                  console.log('5');

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

//Change password otp verification
const verifyChangePassOtp = async(req,res,next) => {    
    try {
        const enteredOtp = req.body.otp;
        if(enteredOtp === req.session.userOtp){
            //res.render('reset-password');
            res.json({success:true,redirectUrl:'/reset-password', user: req.session.user});
        }else{
            res.json({success:false,message:"OTP does not match"});
        }
    } catch (error) {
        next(new CustomError(500, "An error occured. Please try again later."))
        //res.status(500).json({success:false,message:"An error occured. Please try again later."});
    }
}

//Address page
const getAddress = async (req, res) => {
    try {
        const userId = req.session.user;
        const page = parseInt(req.query.page) || 1; 
        const limit = 4; 

        const user = await User.findById({_id:userId});

        const addressData = await Address.findOne({ userId: userId });

        if (!addressData || !addressData.address || addressData.address.length === 0) {
            return res.render('address', {
                userAddress: null,
                currentPage: page,
                totalPages: 0,
                user: user
            });
        }

        const totalAddresses = addressData.address.length;
        const totalPages = Math.ceil(totalAddresses / limit);

        const paginatedAddresses = addressData.address.slice((page - 1) * limit, page * limit);

        res.render('address', {
            userAddress: { address: paginatedAddresses },
            currentPage: page,
            totalPages: totalPages,
            user: user
        });

    } catch (error) {
        console.error("Error retrieving user address", error);
        res.redirect('/pageNotFound');
    }
};

//Adding new address
const addAddress = async(req,res) => {
    try {
        const redirectTo = req.query.redirectTo || "address";
        console.log(redirectTo)
        const userId = req.session.user;
        const user = await User.findById({_id:userId});
        res.render('add-address',{
            user:user, redirectTo: redirectTo
        });
    } catch (error) {
        res.redirect('/pageNotFound');
    }
}

//Adding new address
const userAddAddress = async(req,res) => {
    try {
        const { redirectTo } = req.body; 
        console.log("hiii",redirectTo);
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
        if (redirectTo === "checkout") {
            res.redirect("/checkout");
        } else {
            res.redirect("/address");
        }
    } catch (error) {
        console.error("Error adding address",error);
        res.redirect('/pageNotFound');
    }
}

//Edit address page
const editAddress = async(req,res) => {
    try {
        console.log("query",req.query);
        const addressId = req.query.id;
        console.log("addres",addressId);
        const redirectTo = req.query.redirectTo || "address"; 
        console.log("addres1",addressId,redirectTo);
        const userId = req.session.user;

        const user = await User.findById({_id:userId});

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

        res.render('edit-address',{
            address:addressData,
            user: user,
            redirectTo: redirectTo
        });
    } catch (error) {
        console.error("Error in editing address",error);
        res.redirect('/pageNotFound');
    }
}

//Editing address
const userEditAddress = async (req, res) => {
    try {
        const data = req.body;
        const addressId = req.query.id;
        const redirectTo = req.body.redirectTo || "address";
        const userId = req.session.user;

        const user = await User.findById({_id:userId});

        const findAddress = await Address.findOne({ "address._id": addressId });
        if (!findAddress) {
            return res.status(404).json({ success: false, message: "Address not found" });
        }

        await Address.updateOne(
            { "address._id": addressId },
            {
                $set: {
                    "address.$": {
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
                }
            }
        );

        res.status(200).json({ success: true, redirectTo });
    } catch (error) {
        console.error("Error in editing address", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

//Deleting address
const deleteAddress = async (req, res, next) => {
    try {
        const addressId = req.query.id;
        const redirectTo = req.query.redirectTo || "address";

        const findAddress = await Address.findOne({ "address._id": addressId });
        if (!findAddress) {
            return res.status(404).json({ success: false, message: "Address Not Found" });
        }

        await Address.updateOne(
            { "address._id": addressId },
            { $pull: { address: { _id: addressId } } }
        );

        return res.json({ success: true, redirectTo, message: "Address deleted successfully" });
    } catch (error) {
        console.error("Error in deleting address", error);
        //res.status(500).json({ success: false, message: "Internal Server Error" });
        next(new CustomError(500, "Internal Server Error"))
    }
};

//Editing profile page
const geteditProfile = async (req, res,next) => {
    try {
        const userId = req.query.id;
        if (!userId) {
            //return res.status(400).send('User ID is required');
            return next(new CustomError(400, "User ID is required"))
        }
        const user = await User.findById(userId);
        if (!user) {
            //return res.status(404).send('User not found');
            return next(new CustomError(400, "User not found"))
        }

        res.render('editProfile', { user });
    } catch (error) {
        console.error(error);
        //res.status(500).send('Internal Server Error');
        next(new CustomError(500, "Internal Server Error"))
    }
};

//Editing user profile
const editProfile = async (req, res) => {
    try {
        const { newFname, newLname, newPhone } = req.body;
        console.log("req", req.body);
        const userId = req.session.user;
        await User.findByIdAndUpdate(userId, {
            fname: newFname,
            lname: newLname,
            phone: newPhone,
        });
        res.status(200).json({ success: true }); 
    } catch (error) {
        res.status(500).json({ success: false }); 
    }
};

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
    getAddress,
    addAddress,
    userAddAddress,
    editAddress,
    userEditAddress,
    deleteAddress,
    geteditProfile,
    editProfile,
}