// models/Page.js
import mongoose from "mongoose";

const todoSchema = new mongoose.Schema({
  id: {
    type: Number,
    required: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
  completed: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const pageSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true,
    },
    date: {
      type: String,
      required: true,
      unique: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    todos: [todoSchema],
    isChanged: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const todoModel =
  mongoose.models.todoPage || mongoose.model("todoPage", pageSchema);

export default todoModel;
