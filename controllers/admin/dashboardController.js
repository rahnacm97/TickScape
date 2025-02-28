const User = require('../../models/userSchema');
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Order = require("../../models/orderSchema");
const Coupon=require("../../models/couponSchema");
const CustomError = require('../../utils/customError');
const mongodb = require("mongodb");
const env = require("dotenv").config();
const crypto = require("crypto");
const { v4: uuidv4 } = require('uuid');
const mongoose = require("mongoose");
const bcrypt = require('bcrypt');
const path = require("path");
const sharp = require("sharp");
const fs = require("fs");



const loadDashboard = async (req,res) => {
    if(req.session.admin){  
      try {

        let page = 1;
        if (req.query.page) {
          page = parseInt(req.query.page, 10);
        }

        let limit = 10;
    
        let skip = (page - 1) * limit;

          const userCount = await User.countDocuments();
          //console.log(userCount);
          const totalSales = await Order.aggregate([
            { 
                $match: { status: { $nin: ["Cancelled", "Returned"] } } 
            },
            { $unwind: "$orderedItems" }, 
            {
                $group: {
                    _id: null,
                    totalAmount: { $sum: "$finalAmount" }, 
                    totalOrder: { $sum: 1 },  
                    totalDiscountPrice: { $sum: "$discount" }, 
                    itemSold: { $sum: "$orderedItems.quantity" } 
                }
            }
        ]);
            
      
        //console.log('total sales',totalSales);
        const salesData = totalSales[0] || {
            totalAmount: 0,
            totalOrder: 0,
            totalDiscount: 0,
            itemSold :0,
       };

      const order = await Order.find().sort({createdOn:-1}).limit(limit).skip((page-1)*limit);
      //console.log(order,"order");

      const count = await Order.countDocuments();
      const totalPage = Math.ceil(count / limit);

      const processingOrders = await Order.countDocuments({ status: 'Order Placed' });

        const totalCouponUsers = await Order.aggregate([
          { $match: { couponApplied: true } },
          { $group: { _id: "$userId" } },
          { $count: "totalUsersApplied" }
      ]);
      
      const couponUsersCount = totalCouponUsers.length > 0 ? totalCouponUsers[0].totalUsersApplied : 0;
      
      //console.log(couponUsersCount);
      
      const topOrders = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
          $group: {
            _id: "$orderedItems.productId", 
            orderCount: { $sum: 1 },
          },
        },
        { $sort: { orderCount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "products",
            localField: "_id",
            foreignField: "_id",
            as: "productDetails",
          },
        },
        { $unwind: "$productDetails" },
        {
          $project: {
            _id: 0,
            productId: "$_id",
            name: "$productDetails.productName",
            orderCount: 1,
          },
        },
      ]);
      
      //console.log("Top Ordered Products:", topOrders);

      const topCategories = await Order.aggregate([
        { $unwind: "$orderedItems" },
        {
          $lookup: {
            from: "products",
            localField: "orderedItems.productId", 
            foreignField: "_id",
            as: "productDetails",
          },
        },
        { $unwind: "$productDetails" },
        {
          $group: {
            _id: "$productDetails.category", 
            categoryCount: { $sum: 1 },
          },
        },
        { $sort: { categoryCount: -1 } },
        { $limit: 5 },
        {
          $lookup: {
            from: "categories",
            localField: "_id",
            foreignField: "_id",
            as: "categoryDetails",
          },
        },
        { $unwind: "$categoryDetails" },
        {
          $project: {
            _id: 0,
            categoryId: "$_id",
            categoryName: "$categoryDetails.name",
            categoryCount: 1,
          },
        },
      ]);
      
      //console.log("Top Categories:", topCategories);
      
      res.render('dashboard', {
            userCount,
            orders: salesData,
            processingOrders,
            totalCouponUsers: couponUsersCount,
            totalPage,
            currentPage: page,
            order:order,
            limit,
            products:topOrders,
            category:topCategories,
            
      })
    } catch (error) {
          res.redirect('/pageerror');
    }
  }
}


module.exports = {
    loadDashboard,
}

