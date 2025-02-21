const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema")
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon = require("../../models/couponSchema");
const Offer = require('../../models/offerSchema');
const CustomError = require('../../utils/customError');
const mongodb = require("mongodb");
const mongoose = require('mongoose')
const razorpay = require("razorpay");
const env = require("dotenv").config();
const crypto = require("crypto");
const { v4: uuidv4 } = require('uuid');
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");
const cron = require('node-cron')

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();
    await Offer.deleteMany({ endDate: { $lt: now } });
  } catch (error) {
    console.error("Error deleting expired offers:", error);
  }
});

const loadOffer = async (req, res) => {
    try {
      const offers = await Offer.find().populate('category')
     
      return res.render("offers",{
        offers
      });
    } catch (error) {
      console.log("offer page not found");
      res.status(500).send("server error");
    }
  };


  const offerAdd = async (req,res)=>{
    try {
      const category = await Category.find()    
      return res.render('addOffers',{category})
    } catch (error) {
      console.log('offer adding page not found');
      res.status(500).send('server error');
    }
  }


  const addOffer = async(req,res)=>{
    try {
      console.log(req.body);
      const offer = req.body;
      // const {category} = req.body
      const category = await Category.findOne({name: offer.category})
        const offerData ={
          startDate:offer.startDate,
          endDate:offer.endDate,
          minPrice:offer.minPrice,
          maxPrice:offer.maxPrice,
          category: category._id,
          offer:offer.offer
        }
        await Offer.insertMany(offerData);
       res.redirect('/admin/offers');
    } catch (error) {
      console.log('offer adding error',error);
      res.status(500).send('server error');
      
    }
  }

  const offerList = async(req,res)=>{
    try {
      const id = req.params.id
      await Offer.updateOne({_id:id},{$set:{isActive:true}})
      res.redirect('/admin/offers');
  
    } catch (error) {
      console.log('product listing error',error);
      res.status(500).send('server error');
      
      
    }
  }

  const offerUnList = async(req,res)=>{
    try {
      const id = req.params.id
      await Offer.updateOne({_id:id},{$set:{isActive:false}})
      res.redirect('/admin/offers');
    } catch (error) {
      console.log('offer unlisting error');
      res.status(500).send('server error');
    }
  }

  const editOffer = async(req,res)=>{
    try { 
      const id = req.params.id
      const offerFind = await Offer.findById(id)
      const category = await Category.find()
      res.render('editOffer',{
        offerFind,
        category
      })
    } catch (error) {
      console.log('edite page is not found',error);
      res.status(500).send('server error');
      
    }
  }

  const offerEdit = async(req,res)=>{
    try {
     const id = req.params.id
      const offer = req.body
      const category = await Category.findOne({name: offer.category})
      const updateOfferData ={
        startDate:offer.startDate,
        endDate:offer.endDate,
        minPrice:offer.minPrice,
        maxPrice:offer.maxPrice,
        category: category._id,
        offer:offer.offer
      }
      await Offer.updateOne({_id:id},{$set:updateOfferData})
      res.redirect('/admin/offers');
    } catch (error) {
      
    }
  }

  module.exports = {
    loadOffer,
    offerAdd,
    offerList,
    offerUnList,
    addOffer,
    editOffer,
    offerEdit
  }