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

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});


const addMoney = async (req, res) => {
  const { amount } = req.body;
  
  const options = {
    amount: amount * 100, 
    currency: "INR",
    receipt: "order_rcptid_11"
  };

  try {
    const order = await razorpay.orders.create(options);
    res.json(order);
  
  } catch (error) {
    res.status(500).send(error);
  }
};

// Verify Payment and Update Wallet
const verifyWalletPayment = async (req, res) => {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature, amount } = req.body;
  
    const body = razorpay_order_id + "|" + razorpay_payment_id;
  
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
  
    if (expectedSignature === razorpay_signature) {
      
      const userId = req.session.user;
      const user = await User.findById(userId);
  
      user.wallet.push({
        amount: parseFloat(amount),
        date: new Date(),
        reason: "User Added"
      });
  
      await user.save();
  
      res.json({ success: true });
    } else {
      res.json({ success: false });
    }
  }

const getUserProfile = async (req, res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
        
        const userProfile = {
            name: userData.fname || "",
            email: userData.email || "",
            contact: userData.phone || ""
        };
        
        res.json(userProfile);
    } catch (error) {
        console.error("Error fetching user profile", error);
        res.status(500).json({ error: "Failed to fetch user profile" });
    }
};

//Wallet history
const walletHistory = async(req,res) => {
    try {
        const userId = req.session.user;
        const userData = await User.findById(userId);
    
        const sortedWallet = userData.wallet.sort((a, b) => {
          return new Date(b.date) - new Date(a.date); 
        });
    
        const page = parseInt(req.query.page) || 1;
        const limit = 5;
        const skip = (page - 1) * limit;
    
        const totalEntries = sortedWallet.length;
        const paginatedWallet = sortedWallet.slice(skip, skip + limit);
    
        res.json({
          walletHistory: paginatedWallet,
          currentPage: page,
          totalPages: Math.ceil(totalEntries / limit),
        });
      } catch (error) {
        console.error("Error retrieving wallet history", error);
        res.status(500).json({ error: "Failed to load wallet history" });
      }
}


module.exports = {
    addMoney,
    verifyWalletPayment,
    getUserProfile,
    walletHistory
}