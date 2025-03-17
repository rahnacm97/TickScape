const User = require("../../models/userSchema");

//Load user details
const customerInfo = async (req, res) => {
  try {
    const search = req.query.search || "";
    const page = parseInt(req.query.page) || 1;
    const limit = 5;
    const userData = await User.find({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    })
      .sort({ createdOn: -1 })
      .limit(limit)
      .skip((page - 1) * limit)
      .exec();
    const count = await User.countDocuments({
      isAdmin: false,
      $or: [
        { name: { $regex: ".*" + search + ".*", $options: "i" } },
        { email: { $regex: ".*" + search + ".*", $options: "i" } },
      ],
    });
    const totalPages = Math.ceil(count / limit);

    res.render("customers", {
      userData,
      totalPages,
      currentPage: page,
      search,
      limit,
    });
  } catch (error) {
    console.error("Error fetching customer data:", error);
    res.status(500).render("error", { message: "Internal Server Error" });
  }
};

//Block customer
const customerBlocked = async (req, res) => {
  try {
    let id = req.query.id;
    console.log("id for blocking", id);
    await User.updateOne({ _id: id }, { $set: { isBlocked: true } });
    res.redirect("/admin/users");
    console.log("Exited");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

//Unblock user
const customerunBlocked = async (req, res) => {
  try {
    let id = req.query.id;
    console.log("id for unblock", id);
    await User.updateOne({ _id: id }, { $set: { isBlocked: false } });
    res.redirect("/admin/users");
  } catch (error) {
    res.redirect("/pageerror");
  }
};

module.exports = {
  customerInfo,
  customerBlocked,
  customerunBlocked,
};
