const Coupon = require('../../models/couponSchema');
const mongoose = require('mongoose');

//Coupon loading
const loadCoupon = async (req, res) => {
  if(!req.session.admin){
    res.redirect('/admin/login');
  }
    try {
      const currentPage = parseInt(req.query.page) || 1;
      const searchQuery = req.query.search || '';  

      const itemsPerPage = 4;
  
      const skip = (currentPage - 1) * itemsPerPage;

      const totalCoupons = await Coupon.countDocuments({
        name: { $regex: searchQuery, $options: 'i' },  
      });
  
      const totalPages = Math.ceil(totalCoupons / itemsPerPage);

      const findCoupons = await Coupon.find({
        name: { $regex: searchQuery, $options: 'i' },
      })
        .skip(skip)
        .limit(itemsPerPage);

      return res.render('coupon', {
        coupons: findCoupons,
        currentPage: currentPage,
        totalPages: totalPages,
        searchQuery: searchQuery,
        limit: itemsPerPage 
      });

    } catch (error) {
      console.log(error);
      return res.redirect('/pageerror');
    }
  };
  
//Create coupon page
const loadCreateCoupon = async(req,res) => {
    try {
        return res.render('add-coupon');
    } catch (error) {
        return res.redirect('/pageerror');
    }
}

//Creating coupon
const createCoupon = async(req,res) => {
    try {
        const data = {
            couponName: req.body.couponName,
            startDate: new Date(req.body.startDate + "T00:00:00"),
            endDate: new Date(req.body.endDate + "T00:00:00"),
            offerPrice: parseInt(req.body.offerPrice),
            minimumPrice: parseInt(req.body.minimumPrice),
        }

        const newCoupon = new Coupon({
            name: data.couponName,
            createdOn: data.startDate,
            expireOn: data.endDate,
            offerPrice: data.offerPrice,
            minimumPrice: data.minimumPrice,
            isList: true
        });
        //console.log("This is new",newCoupon);
        await newCoupon.save();
        return res.redirect('/admin/coupon');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

//Edit coupon page
const editCoupon = async(req,res) => {
    try {
        const id = req.query.id;
        const findCoupon = await Coupon.findOne({_id:id});
        res.render('edit-coupon',{
            findCoupon: findCoupon,
        })
    } catch (error) {
        res.redirect('/pageerror');
    }
}

//Editing coupon
const updateCoupon = async (req, res) => {
  try {
      const couponId = req.body.couponId;
      const oid = new mongoose.Types.ObjectId(couponId);
      
      // Check if the coupon exists
      const selectedCoupon = await Coupon.findOne({ _id: oid });
      if (!selectedCoupon) {
          return res.status(404).send("Coupon not found");
      }

      // Check if another coupon with the same name exists
      const existingCoupon = await Coupon.findOne({
          name: { $regex: new RegExp("^" + req.body.couponName + "$", "i") },
          _id: { $ne: oid } // Ensure it's not the same coupon being updated
      });

      if (existingCoupon) {
          return res.status(400).send("Coupon name already exists, choose another name");
      }

      // Convert dates and update the coupon
      const startDate = new Date(req.body.startDate);
      const endDate = new Date(req.body.endDate);
      
      const updatedCoupon = await Coupon.updateOne(
          { _id: oid },
          {
              $set: {
                  name: req.body.couponName,
                  createdOn: startDate,
                  expireOn: endDate,
                  offerPrice: parseInt(req.body.offerPrice),
                  minimumPrice: parseInt(req.body.minimumPrice),
              }
          },
      );

      //console.log(result.modifiedCount);

      if (updatedCoupon.modifiedCount > 0) {
          res.send("Coupon updated successfully");
      } else {
          res.status(500).send("Coupon update failed");
      }
      
  } catch (error) {
      console.error("Error updating coupon:", error);
      res.redirect('/pageerror');
  }
};

//Listing coupon
const getListCoupon = async(req,res,next) => {
  try {
      let id = req.query.id;
      await Coupon.updateOne({_id:id},{$set:{isList:false}});
      res.redirect('/admin/coupon');
  } catch (error) {
      res.redirect('/pageerror');
  }
}

//Unlisting coupon
const getUnlistCoupon = async(req,res,next) => {
  try {
      let id = req.query.id;
      await Coupon.updateOne({_id:id},{$set:{isList:true}});
      res.redirect('/admin/coupon');
  } catch (error) {
      res.redirect('/pageerror');
  }
}

//delete coupon
const deleteCoupon = async (req, res) => {
    try {
      const id = req.query.id; 
      console.log("Deleting coupon with ID:", id); 
  
      const result = await Coupon.deleteOne({ _id: id });
      if (result.deletedCount === 0) {
        return res.status(404).send({ success: false, message: "Coupon not found" });
      }
  
      res.status(200).send({ success: true, message: "Coupon deleted successfully" });
    } catch (error) {
      console.error("Error deleting coupon:", error);
      res.status(500).send({ success: false, message: "Failed to delete coupon" });
    }
  };
  

module.exports = {
    loadCoupon,
    loadCreateCoupon,
    createCoupon,
    editCoupon,
    updateCoupon,
    getListCoupon,
    getUnlistCoupon,
    deleteCoupon
}