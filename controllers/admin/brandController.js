const mongoose = require("mongoose");
const Brand = require("../../models/brandSchema");
const Product = require("../../models/productSchema");
const CustomError = require("../../utils/customError");

//brand page loading
const getBrandsPage = async (req, res) => {
  if (!req.session.admin) {
    res.redirect("/admin/login");
  }
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;
    const searchQuery = req.query.search || "";
    let brandData;
    if (searchQuery) {
      brandData = await Brand.find({ brandName: new RegExp(searchQuery, "i") })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    } else {
      brandData = await Brand.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);
    }
    console.log("1", brandData);
    const totalBrands = await Brand.countDocuments();
    const totalPages = Math.ceil(totalBrands / limit);
    const reverseBrand = brandData.reverse();

    res.render("brands", {
      data: reverseBrand,
      currentPage: page,
      totalPages: totalPages,
      totalBrands: totalBrands,
      limit: limit,
      searchQuery: searchQuery,
    });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//Add brand page get
const getAddBrand = async (req, res) => {
  if (!req.session.admin) {
    res.redirect("/admin/login");
  }
  try {
    res.render("add-Brand");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//Brand adding
const addBrand = async (req, res) => {
  try {
    const brand = req.body.name;
    const findBrand = await Brand.findOne({ brandName: brand });
    if (!findBrand) {
      const image = req.file.filename;
      const newBrand = new Brand({
        brandName: brand,
        brandImage: image,
      });
      await newBrand.save();
      res.redirect("/admin/brands");
    }
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//Block the brand
const blockBrand = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id || !mongoose.Types.ObjectId.isValid(id.trim())) {
      return res.status(400).redirect("/pageerror");
    }
    await Brand.updateOne({ _id: id.trim() }, { $set: { isBlocked: true } });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error blocking brand:", error);
    res.status(500).redirect("/pageerror");
  }
};

//Unbloak brand
const unBlockBrand = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id || !mongoose.Types.ObjectId.isValid(id.trim())) {
      return res.status(400).redirect("/pageerror");
    }
    await Brand.updateOne({ _id: id.trim() }, { $set: { isBlocked: false } });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error unblocking brand:", error);
    res.status(500).redirect("/pageerror");
  }
};

//Delete brand
const deleteBrand = async (req, res) => {
  try {
    const { id } = req.query;
    if (!id || !mongoose.Types.ObjectId.isValid(id.trim())) {
      return res.status(400).redirect("/pageerror");
    }
    await Brand.deleteOne({ _id: id.trim() });
    res.redirect("/admin/brands");
  } catch (error) {
    console.error("Error deleting brand:", error);
    res.status(500).redirect("/pageerror");
  }
};

//Edit brand page loading
const getEditBrand = async (req, res) => {
  if (!req.session.admin) {
    res.redirect("/admin/login");
  }
  try {
    const id = req.query.id;
    if (!id) {
      return res.redirect("/pageerror");
    }
    const brand = await Brand.findById(id);
    if (!brand) {
      return res.redirect("/pageerror");
    }
    res.render("edit-brand", { brand });
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//brand edit
const editBrand = async (req, res, next) => {
  try {
    const id = req.params.id.trim();

    if (!id) {
      next(new CustomError(400, "Invalid brand ID"));
      //return res.status(400).send("Invalid brand ID");
    }

    const brand = await Brand.findOne({ _id: id });
    if (!brand) {
      next(new CustomError(404, "Brand not found"));
      //return res.status(404).send("Brand not found");
    }

    const existingBrand = await Brand.findOne({
      brandName: req.body.brandName,
      _id: { $ne: id },
    });

    if (existingBrand) {
      next(
        new CustomError(
          400,
          "Brand with this name already exists. Please try with another name."
        )
      );
    }

    const image = [];
    if (req.files && req.files.length > 0) {
      image.push(`uploads/product-images/${file.filename}`);
    }

    const updateFields = {
      brandName: req.body.brandName,
    };

    if (image.length > 0) {
      updateFields.brandImage = image;
    }

    const updatedBrand = await Brand.findByIdAndUpdate(id, updateFields, {
      new: true,
    });
    res.render("edit-brand", { brand: updatedBrand });
  } catch (error) {
    console.error("Error in edit brand:", error);
    res.redirect("/pageerror");
  }
};

//Delete image of brand
const deleteSingleImage = async (req, res) => {
  try {
    console.log("halooo");

    const { imageNameToServer, brandIdToServer } = req.body;
    console.log("brandId:", brandIdToServer);
    console.log("imageName:", imageNameToServer);

    const brand = await Brand.findByIdAndUpdate(brandIdToServer, {
      $pull: { brandImage: imageNameToServer },
    });

    const imagePath = path.join("public", imageNameToServer);
    console.log("Image path:", imagePath);

    if (fs.existsSync(imagePath)) {
      await fs.unlinkSync(imagePath);
      console.log(`Image ${imageNameToServer} deleted successfully.`);
    } else {
      console.log(`Image ${imageNameToServer} not found.`);
    }

    res.send({ status: true });
  } catch (error) {
    console.error("Error deleting image:", error);
    res.redirect("/pageerror");
  }
};

module.exports = {
  getBrandsPage,
  getAddBrand,
  addBrand,
  blockBrand,
  unBlockBrand,
  deleteBrand,
  getEditBrand,
  editBrand,
  deleteSingleImage,
};
