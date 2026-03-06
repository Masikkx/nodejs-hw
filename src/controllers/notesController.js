import { Note } from '../models/note.js';
import createHttpError from 'http-errors';

//Усі нотатки
export const getAllNotes = async (req, res) => {
  const { page = 1, perPage = 10, tag, search = '' } = req.query;

  const filter = {};

  if (tag) {
    filter.tag = tag;
  }

  if (search) {
    filter.$text = { $search: search };
  }

  const skip = (page - 1) * perPage;

  const [notes, totalNotes] = await Promise.all([
    Note.find(filter).skip(skip).limit(perPage),
    Note.countDocuments(filter),
  ]);

  const totalPages = Math.ceil(totalNotes / perPage);

  res.status(200).json({
    page,
    perPage,
    totalNotes,
    totalPages,
    notes,
  });
};

//Нотатка за ІD
export const getNoteById = async (req, res) => {
  const { noteId } = req.params;
  const note = await Note.findById(noteId);

  if (!note) {
	throw createHttpError(404, 'Note not found');
  }

  res.status(200).json(note);
};


//Нова нотатка
export const createNote = async (req, res) => {
  const note = await Note.create(req.body);
  res.status(201).json(note);
};


//Видалити нотатку за ІD
export const deleteNote = async (req, res) => {
  const { noteId } = req.params;
  const note = await Note.findOneAndDelete({
    _id: noteId,
  });

  if (!note) {
    throw createHttpError(404, "Note not found");
  }

  res.status(200).json(note);
};

//Оновити нотатку за ІD
export const updateNote = async (req, res) => {
  const { noteId } = req.params;

  const note = await Note.findOneAndUpdate(
    { _id: noteId },
    req.body,
    { new: true },
  );

  if (!note) {
	throw createHttpError(404, 'Note not found');
  }

  res.status(200).json(note);
};
