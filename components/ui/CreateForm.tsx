import React from "react";
import { cn } from "@/lib/utils/index";
import { ClassValue } from "clsx";

const CreateForm = () => {
	return <div>CreateForm</div>;
};

type TextInputParams = {
	placeholder: string; // the default text to display when the input is empty

	minLength: number; // the minimum number of characters required for the input

	maxLength: number; // the maximum number of characters allowed for the input

	regex: string; // a pattern that the input value has to match for it to be considered valid

	value: string; // the current value of the input

	className: ClassValue; // additional CSS classes to apply to the wrapper element

	inputClassname: ClassValue; // additional CSS classes to apply to the input element

	children: React.ReactNode; // any additional elements or components to be rendered inside the wrapper element
};
const TextInput = ({
	placeholder,
	minLength,
	maxLength,
	regex,
	value,
	className,
	inputClassname,
	children
}: TextInputParams) => {
	return (
		<div className={cn(`w-20 relative`, className)}>
			<input
				type="text"
				value={value}
				placeholder={placeholder}
				className={cn(``, inputClassname)}
			/>
			{children}
		</div>
	);
};

type DropdownParams = {};
export const Dropdown = ({}: DropdownParams) => {};

type NumInputParams = {};
export const NumInput = ({}: NumInputParams) => {};

type SearchDropdownParams = {};
export const SearchDropdown = ({}: SearchDropdownParams) => {};

type AddressInputsParams = {};
export const AddressInputs = ({}: AddressInputsParams) => {};

type NameInputsParams = {};
export const NameInputs = ({}: NameInputsParams) => {};

type TagInputParams = {};
export const TagInput = ({}: TagInputParams) => {};

type DateInputParams = {};
export const DateInput = ({}: DateInputParams) => {};

export default CreateForm;
