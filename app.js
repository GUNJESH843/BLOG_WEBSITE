const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const path = require("path");
const _ = require("lodash");
require("dotenv").config();
const mongoose = require("mongoose");
const session = require("express-session");
const passport = require("passport");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const authRouter = require("./routers/auth");
const contactRouter = require("./routers/contact");
const { User } = require("./models/auth");
const blogsData = require('./blog.json');
const blogs1 = blogsData.blogs;
const fs = require('fs');
const multer = require("multer");

// Configure storage for uploaded files
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "public/uploads"); // Save files to the 'public/uploads' directory
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname)); // Add a timestamp to the filename
  },
});

// Initialize multer
const upload = multer({ storage: storage });

const homeStartingContent =
  "Step into the world of words with our user-friendly blog platform! Whether you're a seasoned writer or just getting started, our intuitive interface makes composing and editing blogs a breeze! Join our community of storytellers, where your unique voice is celebrated. Ready to share your thoughts? Click the 'Compose' button below and let your creativity flow! Your blogging journey begins here.";
const aboutContent =
  "Welcome to Daily Journal, your go-to destination for daily journaling and blogging. We understand the power of words and the importance of sharing your thoughts with the world. Our platform is designed to empower individuals like you to express themselves, reflect on their daily lives, and connect with a community of like-minded writers.";
const contactContent =
  "Scelerisque eleifend donec pretium vulputate sapien. Rhoncus urna neque viverra justo nec ultrices. Arcu dui vivamus arcu felis bibendum. Consectetur adipiscing elit duis tristique. Risus viverra adipiscing at in tellus integer feugiat. Sapien nec sagittis aliquam malesuada bibendum arcu vitae. Consequat interdum varius sit amet mattis. Iaculis nunc sed augue lacus. Interdum posuere lorem ipsum dolor sit amet consectetur adipiscing elit. Pulvinar elementum integer enim neque. Ultrices gravida dictum fusce ut placerat orci nulla. Mauris in aliquam sem fringilla ut morbi tincidunt. Tortor posuere ac ut consequat semper viverra nam libero.";

const app = express();
const PORT = process.env.PORT || 3000;
const sessionConfig = {
  name: "session",
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: {
    httpOnly: true,
    expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  },
};

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views")); // Ensure EJS files are inside the 'views' directory

app.use(
  bodyParser.urlencoded({
    extended: true,
  })
);
app.use(express.static("public"));
app.use(session(sessionConfig));
app.use(express.json());
app.use(passport.initialize());
app.use(passport.session());
passport.use(User.createStrategy());
passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

let posts = [];

app.use((req, res, next) => {
  res.locals.user = req.user;
  next();
});

app.get("/", function (req, res) {
  res.render("home", {
    blog1: homeStartingContent,
    posts: [],
  });
});

app.get("/home", function (req, res) {
  res.render("home2", {
    blog1: homeStartingContent,
    posts: posts, // Pass the posts array to the frontend
  });
});

app.get("/about", function (req, res) {
  res.render("about", {
    blog2: aboutContent,
  });
});

app.get("/contact", function (req, res) {
  res.render("contact", {
    blog3: contactContent,
  });
});

app.get("/compose", function (req, res) {
  res.render("compose");
});

app.post("/compose", upload.single("newImage"), function (req, res) {
  const post = {
    title: req.body.newTitle,
    blog: req.body.newBlog,
    image: req.file ? `/uploads/${req.file.filename}` : "", // Save the image path
  };
  const post1 = {
    title: req.body.newTitle,
    content: req.body.newBlog,
    image: req.file ? `/uploads/${req.file.filename}` : "", // Save the image path
  };
  posts.push(post);
  blogsData.blogs.push(post1);
  const jsonString = JSON.stringify(blogsData, null, 2);
  fs.writeFileSync('./blog.json', jsonString, 'utf-8');
  res.redirect("/home");
});

app.get("/posts/:postName", function (req, res) {
  const requestedTitle = _.lowerCase(req.params.postName);

  let nextBlogAuthor = "Unknown Author"; // Default author for /posts route

  posts.forEach(function (post) {
    const storedTitle = _.lowerCase(post.title);

    if (storedTitle === requestedTitle) {
      res.render("post", {
        nextBlogTitle: post.title,
        nextBlog: post.blog,
        nextBlogAuthor: nextBlogAuthor,
        nextBlogImage: post.image || "", // added image
      });
    }
  });
});

app.get("/blogs", function (req, res) {
  res.render("blogs", { blogs: blogsData.blogs });
});

app.get("/error", function (req, res) {
  res.render("error", { error1: "Unauthorised Access" });
});

app.get("/blogs/:blogName", function (req, res) {
  const requestedTitle = _.lowerCase(req.params.blogName);

  blogsData.blogs.forEach(function (blog) {
    const storedTitle = _.lowerCase(blog.title);

    if (storedTitle === requestedTitle) {
      res.render("post", {
        nextBlogImage: blog.image,
        nextBlogTitle: blog.title,
        nextBlogAuthor: blog.author || "Unknown Author", // added default
        nextBlog: blog.content,
      });
    }
  });
});

app.get("/forgotpassword", function (req, res) {
  res.render("forgotpassword");
});

app.post("/forgotpassword", async function (req, res) {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.redirect("/error");
  }

  const otp = crypto.randomBytes(3).toString("hex");
  user.resetPasswordOTP = otp;
  // Increase OTP expiration time to 5 minutes for testing
  user.resetPasswordExpires = Date.now() + 1000 * 60 * 5; // 5 minutes
  await user.save();
  console.log(`OTP for ${email}: ${otp}`); // Display the OTP in the command line
  console.log(`Saved OTP in DB: ${user.resetPasswordOTP}`); // Debug: verify saved OTP

  const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: process.env.EMAIL_PORT,
    secure: false,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  const mailOptions = {
    to: user.email,
    from: process.env.EMAIL_USER,
    subject: "Password Reset OTP",
    text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n
    Please use the following OTP to complete the process:\n\n
    ${otp}\n\n
    If you did not request this, please ignore this email and your password will remain unchanged.\n`,
  };

  transporter.sendMail(mailOptions, (err) => {
    if (err) {
      console.error("Error sending email:", err);
      return res.redirect("/error");
    }
    res.redirect(`/verifyotp?email=${email}`);
  });
});

app.get("/verifyotp", function (req, res) {
  const { email } = req.query;
  res.render("verifyotp", { email });
});

app.post("/verifyotp", async function (req, res) {
  const { email } = req.body;
  const otp = req.body.otp.trim(); // Trim whitespace from OTP
  console.log(`Verifying OTP for ${email}: ${otp}`); // Debugging information

  const user = await User.findOne({
    email,
    resetPasswordOTP: otp,
    resetPasswordExpires: { $gt: Date.now() },
  });

  console.log(`User found: ${user}`); // Debugging information

  if (!user) {
    console.log("Invalid OTP or OTP has expired."); // Debugging information
    return res.render("verifyotp", {
      email,
      status: "error",
      message: "Invalid OTP or OTP has expired.",
    });
  }

  res.redirect(`/resetpassword?email=${email}&otp=${otp}`);
});

app.get("/resetpassword", function (req, res) {
  const { email, otp } = req.query;
  res.render("resetpassword", { email, otp });
});

app.post("/resetpassword", async function (req, res) {
  const { email, otp, password } = req.body;
  const user = await User.findOne({
    email,
    resetPasswordOTP: otp,
    resetPasswordExpires: { $gt: Date.now() },
  });

  if (!user) {
    return res.redirect("/error");
  }

  user.setPassword(password, async (err) => {
    if (err) {
      console.error("Error setting password:", err);
      return res.redirect("/error");
    }

    user.resetPasswordOTP = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    res.redirect("/signin");
  });
});

app.post("/delete/:index", function (req, res) {
  const index = req.params.index;

  // Remove the blog from the in-memory array
  posts.splice(index, 1);

  // Update the blogsData JSON file
  blogsData.blogs.splice(index, 1);
  const jsonString = JSON.stringify(blogsData, null, 2);
  fs.writeFileSync('./blog.json', jsonString, 'utf-8');

  res.redirect("/home"); // Redirect to the home page after deletion
});

app.post("/signup", async (req, res) => {
  const { name, email, contact, dob, password } = req.body;

  try {
    const user = new User({
      name,
      email,
      contact,
      dob,
    });

    // Register the user with the password
    await User.register(user, password);

    // Authenticate and redirect to the home page
    passport.authenticate("local")(req, res, () => {
      res.redirect("/home");
    });
  } catch (err) {
    console.error("Error during signup:", err);
    res.redirect("/signup");
  }
});

app.get("/profile", (req, res) => {
  if(req.isAuthenticated()){
    res.render("profile", { user: req.user });
  } else {
    res.redirect("/signin");
  }
});

// GET route for displaying the profile edit form
app.get("/profile/edit", (req, res) => {
  if(req.isAuthenticated()){
    res.render("editProfile", { user: req.user });
  } else {
    res.redirect("/signin");
  }
});

// POST route for updating the profile
app.post("/profile/edit", async (req, res) => {
  if(req.isAuthenticated()){
    const { name, email, contact, dob } = req.body;
    try {
      // Update the user document using Mongoose's findByIdAndUpdate
      await User.findByIdAndUpdate(req.user._id, {
        name,
        email,
        contact,
        dob,
      });
      res.redirect("/profile");
    } catch (err) {
      console.error("Error updating profile:", err);
      res.redirect("/profile/edit");
    }
  } else {
    res.redirect("/signin");
  }
});

app.use("/", authRouter);
app.use("/", contactRouter);

app.get("*", (req, res) => {
  res.status(404).render("404");
});

mongoose
  .connect(process.env.MONGODB_URI)
  .then(() => console.log("connected"))
  .catch((error) => console.log(error));

app.listen(PORT, function () {
  console.log(`Server started on port ${PORT}`);
});
