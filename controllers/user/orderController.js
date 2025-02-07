const User = require("../../models/userSchema");
const Category = require("../../models/categorySchema");
const Product = require("../../models/productSchema");
const Address = require("../../models/addressSchema");
const Cart = require("../../models/cartSchema");
const Order = require("../../models/orderSchema");
const env = require("dotenv").config();
const session = require("express-session");
const mongoose = require('mongoose');

const getConfirmation = async (req, res) => {
    try {
        let orders = {};
        if (req.query.orders) {
            orders = JSON.parse(decodeURIComponent(req.query.orders));           
            const populatedOrders = await Promise.all(
                orders.previewOrder.map(async (order) => {
                    const product = await Product.findById(order.product); 
                    return {
                        ...order,
                        product: product ? product.toObject() : null, 
                    };
                })
            );
            orders.previewOrder = populatedOrders;
        }
        //console.log("id",orders);
        res.render("orders", { 
            orders,
            user: req.session.user,
            orderId: orders.address._id,
        }); 
    } catch (error) {
        console.error("Error processing orders:", error);
        res.status(500).send("Error loading the page");
    }
};

const viewOrder = async(req,res) => {
    try {
        let orders = {};
        if (req.query.orders) {
            orders = JSON.parse(decodeURIComponent(req.query.orders));           
            const populatedOrders = await Promise.all(
                orders.previewOrder.map(async (order) => {
                    const product = await Product.findById(order.product); 
                    return {
                        ...order,
                        product: product ? product.toObject() : null, 
                    };
                })
            );
            orders.previewOrder = populatedOrders;
        }
        // console.log("id",orders);
        res.render("viewOrder", { 
            orders,
            user: req.session.user,
            //orderId: orders.address._id,
        }); 
    } catch (error) {
        console.error("Error processing orders:", error);
        res.status(500).send("Error loading the page");
    }
}


module.exports = {
    getConfirmation,
    viewOrder,
}