"use client";
import React, { useState } from "react";
import { cn } from "@/lib/utils/index";
import {
	TextInput,
	Dropdown,
	NumInput,
	SearchDropdown,
	AddressInputs,
	NameInputs,
	TagInput,
	DateInput,
} from "./CreateItems";

/* For Brendan:
	Classes you'll use often:
- "bg-background-main": Main background color
- "bg-background-primary": Primary background color (e.g. for dropdown items on hover)
- "text-primary": Primary text color
- flexbox utilities: "flex", "items-center", "justify-center", "gap-4", etc.
- padding/margin utilities: "p-4", "m-2", "px-6", etc.
- rouned corners: rounded-lg is the default for inputs and dropdowns

*/



const CreateForm = () => {
	const [name, setName] = useState("");
	const [amount, setAmount] = useState("42");
	const [dropdownValue, setDropdownValue] = useState("");
	const [searchValue, setSearchValue] = useState("");
	const [tags, setTags] = useState<string[]>(["example", "beta"]);
	const [dateValue, setDateValue] = useState("");
	const [address, setAddress] = useState({
		line1: "",
		line2: "",
		city: "",
		state: "",
		postalCode: "",
	});
	const [personName, setPersonName] = useState({ first: "", last: "" });

	const options = [
		{ label: "Option 1", value: "option1" },
		{ label: "Option 2", value: "option2" },
		{ label: "Disabled option", value: "option3", disabled: true },
	];

	return (
		<div className={cn("w-full min-h-screen flex items-start justify-center p-10")}> 
			<div className="grid gap-6">
				<TextInput placeholder="Text input" value={name} onChange={setName} />
				<NumInput placeholder="Number input" value={amount} onChange={setAmount} min={0} step={1} />
				<Dropdown
					options={options}
					value={dropdownValue}
					onChange={setDropdownValue}
					placeholder="Select option"
				/>
				<SearchDropdown
					options={options}
					value={searchValue}
					onChange={setSearchValue}
					placeholder="Search options"
				/>
				<NameInputs value={personName} onChange={setPersonName} />
				<AddressInputs value={address} onChange={setAddress} />
				<TagInput value={tags} onChange={setTags} placeholder="Add tag" />
				<DateInput value={dateValue} onChange={setDateValue} />
			</div>
		</div>
	);
};

export default CreateForm;
