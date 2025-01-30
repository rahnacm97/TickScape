const mongoose = require('mongoose');
const Brand = require('../../models/brandSchema');
const Product = require('../../models/productSchema');

const getBrandsPage = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = 4;
        const skip = (page - 1) * limit;
        const searchQuery = req.query.search || ''; // Get search query from the URL

        let brandData;
        if (searchQuery) {
            // If there's a search query, filter brands based on the search text
            brandData = await Brand.find({ name: new RegExp(searchQuery, 'i') }) // Case-insensitive search
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
        } else {
            // If no search query, just fetch the latest brands
            brandData = await Brand.find({})
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit);
        }

        const totalBrands = await Brand.countDocuments();
        const totalPages = Math.ceil(totalBrands / limit);
        const reverseBrand = brandData.reverse();

        res.render("brands", {
            data: reverseBrand,
            currentPage: page,
            totalPages: totalPages,
            totalBrands: totalBrands,
            limit: limit,
            searchQuery: searchQuery // Pass searchQuery to the view
        });
    } catch (error) {
        res.redirect('/pageerror');
    }
};


const getAddBrand = async(req,res) => {
    try {
        res.render('add-Brand');
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const addBrand = async(req,res) => {
    try {
        const brand = req.body.name;
        const findBrand = await Brand.findOne({brandName:brand});
        if(!findBrand){
            const image =req.file.filename;
            const newBrand = new Brand({
                brandName: brand,
                brandImage: image
            })
            await newBrand.save();
            res.redirect('/admin/brands');
        }
    } catch (error) {
        res.redirect('/pageerror');
    }
}

const blockBrand = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id || !mongoose.Types.ObjectId.isValid(id.trim())) {
            return res.status(400).redirect('/pageerror'); // Validate the ID
        }
        await Brand.updateOne({ _id: id.trim() }, { $set: { isBlocked: true } });
        res.redirect('/admin/brands');
    } catch (error) {
        console.error("Error blocking brand:", error);
        res.status(500).redirect('/pageerror');
    }
};

const unBlockBrand = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id || !mongoose.Types.ObjectId.isValid(id.trim())) {
            return res.status(400).redirect('/pageerror'); // Validate the ID
        }
        await Brand.updateOne({ _id: id.trim() }, { $set: { isBlocked: false } });
        res.redirect('/admin/brands');
    } catch (error) {
        console.error("Error unblocking brand:", error);
        res.status(500).redirect('/pageerror');
    }
};

const deleteBrand = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id || !mongoose.Types.ObjectId.isValid(id.trim())) {
            return res.status(400).redirect('/pageerror'); 
        }
        await Brand.deleteOne({ _id: id.trim() });
        res.redirect('/admin/brands');
    } catch (error) {
        console.error("Error deleting brand:", error);
        res.status(500).redirect('/pageerror');
    }
};

module.exports = {
    getBrandsPage,
    getAddBrand,
    addBrand,
    blockBrand,
    unBlockBrand,
    deleteBrand,

}